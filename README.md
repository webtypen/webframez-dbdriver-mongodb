# webframez MongoDB Driver

## Registration:

app.ts:

```ts
import { WebApplication, DBDrivers } from "@webtypen/webframez-core";
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

## Core database decoupling (0.0.11)

This release implements the core's `idAdapter` and `documentStore(client)`
capabilities. Native BSON IDs, collections, cursors and atomic claims live in this
package. MongoDB remains a runtime dependency here; core 0.3.69 no longer installs it.

For a staged upgrade from core 0.3.68 / driver 0.0.10, update this driver first,
then update core to 0.3.69. The existing driver methods remain available to core
0.3.68. Core 0.3.69 requires driver >=0.0.11 for the new capabilities. Applications
with native MongoDB imports must keep their own compatible `mongodb` dependency.
No database migration is needed.

`documentStore(...).collection(...).findOneAndUpdate(...)` explicitly requests
`includeResultMetadata: false` and returns a document or `null`, including when
a document itself contains a `value` property. Claims use one atomic MongoDB
operation, preserving concurrency protection for queue workers and notifications.

Run unit tests with `npm test`. To include integration tests against a fresh,
isolated temporary database (never the application's configured database):

```bash
WEBFRAMEZ_TEST_MONGOD=/usr/bin/mongod \
WEBFRAMEZ_TEST_CORE=/absolute/path/to/webframez-core/dist/index.js npm test
```

Build core first. The integration test covers CRUD, DataBuilder saves, Datatable
selection, concurrent atomic updates, embedded queue execution and notification
claims. It creates a temporary data directory and loopback listener, and removes
them afterward.
