import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { MongoDBDriver } from "./MongoDBDriver";

test("model IDs use the MongoDB 6 BSON implementation", async () => {
    const driver = new MongoDBDriver();
    const id = await driver.objectId("6305d657b78c36153b80fd9b");
    assert.ok(id instanceof ObjectId);
    assert.equal(id.toHexString(), "6305d657b78c36153b80fd9b");
    assert.equal(await driver.objectId(id), id);
    assert.ok(await driver.objectId() instanceof ObjectId);
    const model: any = { __primaryKey: "_id" };
    await driver.onModelSave(model, { acknowledged: true, insertedId: id });
    assert.equal(model._id, id);
});

test("driver preserves MongoDB 6 write results and update filters", async () => {
    const driver = new MongoDBDriver();
    const id = new ObjectId();
    const data = { title: "Changed" };
    const result = { acknowledged: true, matchedCount: 1, modifiedCount: 0 };
    const client: any = { db: () => ({ collection: () => ({
        updateOne: async (filter: any, update: any) => {
            assert.deepEqual(filter, { _id: id });
            assert.deepEqual(update, { $set: data });
            return result;
        },
    }) }) };
    assert.equal(await driver.execute(client, { type: "updateOne", table: "records", filter: { _id: id }, data }), result);
});


test("ID adapter normalizes foreign BSON IDs and rejects malformed values", () => {
    const ids = new MongoDBDriver().idAdapter;
    const hex = "6305d657b78c36153b80fd9b";
    const foreign = { toString: () => hex };
    assert.ok(ids.normalize(foreign) instanceof ObjectId);
    assert.equal(ids.equals(foreign, hex), true);
    for (const invalid of [null, undefined, 0, "invalid", "abcdefghijkl", Object.create(null)]) {
        assert.equal(ids.normalize(invalid), null);
        assert.equal(ids.isValid(invalid), false);
    }
    assert.throws(() => ids.create("invalid"), /Invalid MongoDB ObjectId/);
    assert.equal(ids.equals(null, null), false);
});
