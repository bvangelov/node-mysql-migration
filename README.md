# mysql-migration-promise

This plugin was initially thought to be fork of https://github.com/borsch/node-mysql-migration, but ended up with quite a few changes.

It gives you the option to run your migrations automatically when starting your application 

<h2>Using</h2>

<h3>Installing</h3>

`npm install mysql-migration-promise` - to install util

<h3>Setup</h3>

```javascript
//my_db_migrations.js
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
```

`/migrations` - is a folder where all migrations scripts are located. There is no default value for it so you should specify it


<h3>File naming convention</h3>

<br />
migration script shoul have the following name template
<br />

```
V(version name)__name_of_script_separated_with_lower_underline.sql

#example
V1__init_tables.sql
V2__add_new_column.sql
```

<br />inside migrations file you should write migrations script in plain SQL
<br />

<b>WARNING</b>

for now migration support only one command in migration script.
<br />
If you migration script contains the following
```sql
ALTER TABLE `tbl_name`
    ADD COLUMN `column_name` VARCHAR(250);
    
ALTER TABLE `tbl_name`
    ADD COLUMN `column_name1` VARCHAR(250);
    
UPDATE `tbl_name` SET `column_name`="asd";
```

then migration will fails.
<br />
to solve this <b>split such migration into three separate migration</b> 
<br /><br />
<b>OR</b>
<br /><br />
customize your connection settings. use: 

```javascript
migration.migrate(mysql.createConnection({
    host     : 'host',
    user     : 'user',
    password : 'password',
    database : 'database',
    multipleStatements: true // add this to allow multiple queries in single migration file
}), __dirname + '/migrations');
````

official [`node-mysql` doc](https://github.com/mysqljs/mysql#multiple-statement-queries)
