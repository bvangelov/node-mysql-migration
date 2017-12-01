const file_system = require('fs');
const md5_sum = require('md5-file');

/**
 * entry point to start migration util
 *
 * @param mysql_connection {Connection} -  to work with database
 * @param migrations_folder {string} - path to migrations folder
 */
module.exports.init = async function (mysql_connection, migrations_folder) {
  if (!migrations_folder) {
    throw new Error('migrations folder are required');
  }

  let query = `CREATE TABLE IF NOT EXISTS \`migrations\` (
                    \`version\` INT PRIMARY KEY,
                    \`name\` TEXT NOT NULL,
                    \`hash_sum\` VARCHAR(50) NOT NULL,
                    \`date\` DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE = InnoDB`;

  async function init() {
    return new Promise(function (resolve, reject) {
      mysql_connection.query(query, function (err) {
        if (err) {
          reject(err);
        }

        resolve();
      });
    });
  }

  await init();

  function rollback() {
    return new Promise(function (resolve) {
      mysql_connection.rollback(function (err) {
        if (err) {
          rollback();
          throw new Error('Can not rollback transaction. reason [' + err.message + ']');
        } else {
          resolve();
        }
      });
    });
  }

  function beginTransaction() {
    return new Promise(function (resolve) {
      mysql_connection.beginTransaction(async function (err) {
        if (err) {
          await rollback();
          throw new Error('Can not start transaction. reason [' + err.message + ']');
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * this function executes new migrations
   * if new are exists
   *
   * @param migrations {object[]} - all existed migrations data
   */
  function precess_migrations(migrations) {
    "use strict";
    migrations.sort(function (a, b) {
      if (a.version > b.version) {
        return 1;
      }
      if (a.version < b.version) {
        return -1;
      }
      return 0;
    });

    return check_old_migrations_checksum(migrations, once(function (version) {
      try {
        if (!version) {
          throw new Error('no version specified for migration');
        }

        for (let i = 0; i < migrations.length; ++i) {
          if (migrations[i].version === version) {
            migrations = migrations.splice(i);
            break;
          }
        }

        if (migrations.length > 0) {
          return migrations.reduce(function (promise, migration) {
            return promise.then(async function () {
              return apply_migration(migration, file_system.readFileSync(migration.absolute_path, "utf8"));
            });
          }, Promise.resolve());
        }
      } catch (error) {
        throw error;
      }
    }));
  }


  async function apply_migration(migration, content) {
    "use strict";

    try {
      await beginTransaction();

      /** RUN MIGRATION QUERY */
      await new Promise(function (resolve, reject) {
        mysql_connection.query(content, async function (err) {
          if (err) {
            await rollback();
            reject('Can not apply migration[' + migration.version + ']. reason [' + err.message + ']');
          } else {
            resolve();
          }
        });
      });

      /** UPDATE MIGRATION TABLE QUERY */
      await new Promise(function (resolve, reject) {
        let to_insert = {
          version: migration.version,
          hash_sum: migration.hash_sum,
          name: migration.name
        };

        mysql_connection.query('INSERT INTO migrations SET ?', to_insert, function (err) {
          if (err) {
            rollback();
            reject('Can not update migrations table for migration[' + migration.version + ']. reason [' + err.message + ']');
          } else {
            resolve();
          }
        });
      });

      /** COMMIT TRANSACTION AND RETURN */
      return new Promise(function (resolve, reject) {
        mysql_connection.commit(function (err) {
          if (err) {
            rollback();
            reject('Can not commit migration[' + migration.version + ']. reason [' + err.message + ']');
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      throw (error);
    }
  }

  /**
   * checks all existed migrations in database if they does not changed
   *
   * @param migrations {object[]} - all existed migrations data
   * @param callback {function} - callback on check end. accept one parameter: not applied migration version or null if all is applied
   */
  async function check_old_migrations_checksum(migrations, callback) {
    "use strict";

    let version = null;
    let i = 0;

    async function check_migration() {
      version = await sync_check_migration(migrations[i]);
      i++
    }

    try {
      do {
         await check_migration();
      } while (!version && i < migrations.length);

      if (!version) {
        /** no new migrations to run */
        return;
      }

      return await callback(version);
    } catch(error) {
      throw new Error('Migration failed with error: ' + error);
    }
  }

  /**
   * make sync promise-chain base call to database to check last applied migration
   *
   * @param migration {object} - migration to check
   * @return {Promise} - contains the result if {migration} is successfully applied
   */
  function sync_check_migration(migration) {
    "use strict";

    return new Promise(function (resolve, reject) {
      mysql_connection.query('SELECT hash_sum FROM migrations WHERE version=' + migration.version, function (error, result) {
        if (error) {
          reject(error);
        } else if (!result || result.length < 1) {
          /** no migration for this version, so we should do it */
          resolve(migration.version);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * function the will be executed only for once
   *
   * @param fn - function to be executed only once
   * @param context
   * @return {Function}
   */
  function once(fn, context) {
    let result;

    return function () {
      if (fn) {
        result = fn.apply(context || this, arguments);
        fn = null;
      }

      return result;
    };
  }

  /**
   * parse file name {version, name, hash_sum}
   *
   * @param file_name {string} - file name
   * @param full_path_to_file {string} - absolute file path
   */
  function parse_file(file_name, full_path_to_file) {
    "use strict";

    let matches = /V(\d+)__([\w\_]+)\.sql/g.exec(file_name);
    if (!matches || matches.index < 0) {
      throw new Error(`file ['${file_name}'] has an invalid file name template\nSee help for more information`);
    }

    return {
      version: parseInt(matches[1]),
      name: matches[2].replace(/_/g, ' '),
      hash_sum: md5_sum.sync(full_path_to_file),
      absolute_path: full_path_to_file
    }
  }

  function migrate() {
    "use strict";

    return new Promise(function (resolve, reject) {
      file_system.readdir(migrations_folder, async (err, files) => {
        if (err) {
          reject(err);
        }

        if (!files || files.length < 1) {
          resolve();
        }

        let migrations = [];
        for (let i = 0; i < files.length; ++i) {
          try {
            let result = parse_file(files[i], migrations_folder + '/' + files[i]);
            migrations.push(result);
          } catch (error) {
            reject(error);

            return;
          }
        }

        await precess_migrations(migrations);
        resolve();
      });
    });
  }

  return {
    migrate: migrate
  };
};