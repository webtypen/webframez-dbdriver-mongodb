# webframez MongoDB Driver

## Registration:

app.ts:

```ts
import { WebApplication } from "@webtypen/webframez-core";
import { DBDrivers } from "@webtypen/webframez-core/src/Database/DBDriver";
import { MongoDBDriver } from "@webtypen/webframez-dbdriver-mongodb";

// ...
DBDrivers.register("mongodb", MongoDBDriver);
// ...

const app = new WebApplication();
app.boot();
```

## Backups

The driver implements the Webframez `backup(client, options)` hook by running `mongodump`.

Server requirements:

```bash
mongodump --version
```

On Ubuntu, install it through MongoDB Database Tools if it is missing.

Example Webframez backup source:

```ts
databases: [
  {
    connection: "default",
    to: "database/mongodb",
    options: {
      gzip: true
    }
  }
]
```
