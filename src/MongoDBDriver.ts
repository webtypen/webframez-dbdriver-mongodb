const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
import { BaseDBDriver, Model, QueryBuilder } from "@webtypen/webframez-core";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

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

        // Match
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

        // Sort
        const sort: { [key: string]: any } = {};
        if (queryBuilder && queryBuilder.sort && queryBuilder.sort.length > 0) {
            for (let i in queryBuilder.sort) {
                if (queryBuilder.sort[i] && queryBuilder.sort[i].column) {
                    sort[queryBuilder.sort[i].column] =
                        queryBuilder.sort[i].sort === "ASC"
                            ? 1
                            : queryBuilder.sort[i].sort === "DESC"
                            ? -1
                            : queryBuilder.sort[i].sort;
                }
            }
        }
        if (sort && Object.keys(sort).length > 0) {
            aggregation.push({ $sort: sort });
        }

        // Offset
        if (queryBuilder && queryBuilder.offsetCount && parseInt(queryBuilder.offsetCount.toString()) > 0) {
            aggregation.push({
                $skip: parseInt(queryBuilder.offsetCount.toString()),
            });
        }

        // Limit
        if (queryBuilder && queryBuilder.limitCount && parseInt(queryBuilder.limitCount.toString()) > 0) {
            aggregation.push({
                $limit: parseInt(queryBuilder.limitCount.toString()),
            });
        }

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
        } else if (queryBuilder.mode === "count") {
            // Count action
            const data = await client
                .db(queryBuilder.database ?? null)
                .collection(queryBuilder.queryTable)
                .aggregate([...aggregation, { $group: { _id: null, count: { $sum: 1 } } }, { $project: { _id: 0 } }])
                .toArray();
            return data && data[0] && data[0].count !== undefined ? data[0].count : 0;
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

    async execute(client: any, executionData: any, options?: any) {
        // Aggregation
        if (executionData.type === "aggregation") {
            return await client
                .db(executionData.database ? executionData.database : null)
                .collection(executionData.table)
                .aggregate(executionData.aggregation, options)
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

    async backup(client: any, options: any) {
        const config: any = this.config || {};
        const backupOptions = options?.options || {};
        const url = backupOptions.url || config.url;
        if (!url) {
            throw new Error("MongoDB backup requires a configured url.");
        }

        const targetDir = options?.targetDir;
        if (!targetDir) {
            throw new Error("MongoDB backup requires options.targetDir.");
        }

        const binary = backupOptions.binary || "mongodump";
        const dumpDir = path.join(targetDir, backupOptions.directory || "dump");
        fs.rmSync(dumpDir, { recursive: true, force: true });
        fs.mkdirSync(dumpDir, { recursive: true });

        const args = ["--uri", url, "--out", dumpDir];
        if (backupOptions.gzip === true) {
            args.push("--gzip");
        }
        if (Array.isArray(backupOptions.args)) {
            args.push(...backupOptions.args.map((entry: any) => String(entry)));
        }

        const startedAt = new Date().toISOString();
        options?.log?.(`Running MongoDB dump into ${dumpDir}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(binary, args, {
                stdio: ["ignore", "pipe", "pipe"],
            });

            const handleOutput = (chunk: Buffer) => {
                const message = chunk.toString("utf-8").trim();
                if (message) {
                    for (const line of message.split(/\r?\n/)) {
                        if (line.trim() !== "") {
                            options?.log?.(`mongodump: ${line.trim()}`);
                        }
                    }
                }
            };

            child.stdout.on("data", handleOutput);
            child.stderr.on("data", handleOutput);
            child.on("error", (error) => {
                reject(
                    new Error(
                        error && (error as any).code === "ENOENT"
                            ? `MongoDB backup requires '${binary}' to be installed and available in PATH.`
                            : error.message,
                    ),
                );
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`MongoDB dump failed with exit code ${code}.`));
                }
            });
        });

        const endedAt = new Date().toISOString();
        return {
            driver: "mongodb",
            binary: binary,
            path: dumpDir,
            gzip: backupOptions.gzip === true,
            startedAt: startedAt,
            endedAt: endedAt,
        };
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

    async objectId(val?: any) {
        return val && typeof val === "string" ? new ObjectId(val) : val ? val : new ObjectId();
    }
}
