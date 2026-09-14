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

## MongoDB 6 upgrade (0.0.10)

Requires Node.js >=16.20.1. Upgrade webframez-core to >=0.3.68 together with this
release to keep the standard queue worker compatible with empty queues. The driver
uses MongoDB ^6.21.0; align the application dependency with that version to avoid
mixing BSON implementations. See [CHANGELOG.md](./CHANGELOG.md) for API changes.
