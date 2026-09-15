import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { MongoClient, ObjectId } from "mongodb";
import { MongoDBDriver } from "./MongoDBDriver";

const binary = process.env.WEBFRAMEZ_TEST_MONGOD;
test("isolated MongoDB: document CRUD, atomic claims, queue execution and notification claims", { skip: !binary || !process.env.WEBFRAMEZ_TEST_CORE, timeout: 30000 }, async () => {
    const core = require(process.env.WEBFRAMEZ_TEST_CORE!);
    const dir = await mkdtemp(path.join(tmpdir(), "webframez-driver-test-"));
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    const child = spawn(binary!, ["--dbpath", dir, "--bind_ip", "127.0.0.1", "--port", String(port), "--quiet"], { stdio: "ignore" });
    const exited = once(child, "exit");
    const url = `mongodb://127.0.0.1:${port}/adapter_test`;
    const probe = new MongoClient(url, { serverSelectionTimeoutMS: 300 });
    let driverConnection: any;
    try {
        for (let attempt = 0; ; attempt++) {
            try { await probe.connect(); break; }
            catch (error) { if (attempt >= 30 || child.exitCode !== null) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        core.Config.register("database", { defaultConnection: "test", connections: { test: { driver: "mongodb", url } } });
        core.DBDrivers.register("mongodb", MongoDBDriver);
        driverConnection = await core.DBConnection.getConnection();
        const db = core.DBConnection.documentStore(driverConnection);
        const rows = db.collection("rows");
        const id = await core.DBConnection.objectId();
        assert.ok(id instanceof ObjectId);
        await rows.insertOne({ _id: id, value: 0, name: "before" });
        await rows.updateOne({ _id: id }, { $set: { name: "after" } });
        assert.equal((await rows.findOne({ _id: id })).name, "after");
        const updates = await Promise.all(Array.from({ length: 8 }, () => rows.findOneAndUpdate({ _id: id }, { $inc: { value: 1 } }, { returnDocument: "after" })));
        assert.deepEqual(updates.map(row => row.value).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
        assert.equal(await rows.findOneAndUpdate({ name: "missing" }, { $set: { value: 1 } }), null);
        assert.equal((await rows.aggregate([{ $group: { _id: null, total: { $sum: "$value" } } }]).toArray())[0].total, 8);
        assert.equal(await rows.countDocuments({}), 1);
        await rows.deleteOne({ _id: id }); assert.equal(await rows.countDocuments({}), 0);

        const builder = new core.DataBuilder();
        builder.registerType({ key: "adapter_rows", singular: "Row", plural: "Rows", schema: {
            collection: "builder_rows", fields: { title: { type: "string" } },
        } });
        const request = { body: { __builder_type: "adapter_rows", __builder_id: "new", data: { title: "before" } } };
        const created = await builder.save(db, request);
        assert.equal(created.status, "success");
        request.body.__builder_id = created.data._id.toString();
        request.body.data.title = "after";
        assert.equal((await builder.save(db, request)).status, "success");
        assert.equal((await db.collection("builder_rows").findOne({ _id: created.data._id })).title, "after");
        const table = new core.Datatable();
        table.collection = "builder_rows";
        table.modelSelector = { label: "title" };
        const preview = await table.getModelSelectorPreview({ body: { value: created.data._id.toString() } });
        assert.equal(preview.title, "after");

        let executed = 0;
        class AdapterJob { static create() {} async handle() { executed++; await new Promise(resolve => setTimeout(resolve, 5)); } }
        core.QueueJobsRegisty.registerJob([AdapterJob]);
        const job = await core.Queue.enqueue("AdapterJob");
        await Promise.all([core.Queue.runOnce(["AdapterJob"]), core.Queue.runOnce(["AdapterJob"])]);
        assert.equal(executed, 1);
        assert.equal((await db.collection("queue_jobs").findOne({ _id: job._id })).status, "finished");
        await core.Queue.runOnce(["AdapterJob"]); assert.equal(executed, 1);

        const notifications = db.collection("notifications");
        await notifications.insertOne({ _id: new ObjectId(), key: "test", mode: "fixed", show_at: new Date(0), created_at: new Date(0), view_status: "unviewed", output_channels_finished_at: null });
        const worker = new core.NotificationsOutputChannelsJob();
        const claims = await Promise.all([worker.claimNotification(notifications, 30, new Date()), worker.claimNotification(notifications, 30, new Date())]);
        assert.equal(claims.filter(Boolean).length, 1);
    } finally {
        await driverConnection?.driver.close(driverConnection.client);
        await probe.close();
        if (child.exitCode === null) child.kill("SIGTERM");
        await exited;
        await rm(dir, { recursive: true, force: true });
    }
});
