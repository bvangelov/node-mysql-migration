let index = require('./index');
let mysql = require('mysql2');

async function start() {
  try {
    let migrationService = await index.init(mysql.createConnection({
      host     : 'localhost',
      user     : 'root',
      password : 'root',
      database : 'migration_test',
      multipleStatements: true
    }), __dirname + '/migrations');

    await migrationService.migrate();
  } catch (error) {
    console.error(error);
  }
}

start();