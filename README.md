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
