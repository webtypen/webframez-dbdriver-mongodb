const { MongoClient, ServerApiVersion } = require("mongodb");
import { exec } from "child_process";
import { Model, QueryBuilder } from "../../webframez-core";
import { BaseDBDriver } from "../../webframez-core/src/Database/BaseDBDriver";

export class MongoDBDriver extends BaseDBDriver {
  client: typeof MongoClient = null;

  async connect() {
    if (this.client) {
      return this.client;
    }

    if (!this.config || !this.config["url" as keyof {}]) {
      throw new Error("Missing MongoDB-URL ...");
    }

    const client = new MongoClient(this.config["url" as keyof {}], {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverApi: ServerApiVersion.v1,
    });

    try {
      await client.connect();
    } catch (e) {
      throw e;
    }
    return client;
  }

  async close(client: any) {
    if (client) {
      await client.close();
    }

    client = null;
  }

  async handleQueryBuilder(client: any, queryBuilder: QueryBuilder) {
    const aggregation = [];
    const match: { [key: string]: any } = {};
    if (queryBuilder && queryBuilder.query && queryBuilder.query.length > 0) {
      for (let q of queryBuilder.query) {
        if (q.type === "where") {
          match[q.column] =
            q.operator === ">="
              ? { $gte: q.value }
              : q.operator === ">"
              ? { $gt: q.value }
              : q.operator === "<="
              ? { $lte: q.value }
              : q.operator === "<"
              ? { $lt: q.value }
              : q.operator === "!="
              ? { $ne: q.value }
              : q.value;
        }
      }

      aggregation.push({ $match: match });
    }

    console.log("queryBuilder.mode", queryBuilder.mode);
    if (queryBuilder.mode === "delete") {
      // Delete many action
      return await client
        .db(queryBuilder.database ?? null)
        .collection(queryBuilder.queryTable)
        .deleteMany(match);
    } else if (queryBuilder.mode === "deleteOne") {
      // Delete one action
      return await client
        .db(queryBuilder.database ?? null)
        .collection(queryBuilder.queryTable)
        .deleteOne(match);
    } else {
      // Select actions
      if (queryBuilder.mode === "first") {
        aggregation.push({ $limit: 1 });
      }

      const data = await client
        .db(queryBuilder.database ?? null)
        .collection(queryBuilder.queryTable)
        .aggregate(aggregation)
        .toArray();

      if (queryBuilder.mode === "first") {
        return data && data[0] ? data[0] : null;
      }
      return data && data.length > 0 ? data : null;
    }
  }

  async execute(client: any, executionData: any) {
    // Aggregation
    if (executionData.type === "aggregation") {
      return await client
        .db(executionData.database ? executionData.database : null)
        .collection(executionData.table)
        .aggregate(executionData.aggregation)
        .toArray();
    }

    // insertOne
    else if (executionData.type === "insertOne") {
      return await client
        .db(executionData.database ? executionData.database : null)
        .collection(executionData.table)
        .insertOne(executionData.data);
    }

    // updateOne
    else if (executionData.type === "updateOne") {
      return await client
        .db(executionData.database ? executionData.database : null)
        .collection(executionData.table)
        .updateOne(executionData.filter, { $set: executionData.data });
    }

    return null;
  }

  async onModelSave(model: Model, saveStatus: any | null | undefined) {
    if (!saveStatus) {
      return model;
    }

    // Set primary-key after insert (ObjectID)
    if (saveStatus.insertedId && model) {
      model[model.__primaryKey] = saveStatus.insertedId;
    }
    return model;
  }
}
