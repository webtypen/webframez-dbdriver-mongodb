"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBDriver = void 0;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const webframez_core_1 = require("@webtypen/webframez-core");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
class MongoDBDriver extends webframez_core_1.BaseDBDriver {
    constructor() {
        super(...arguments);
        this.client = null;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client) {
                return this.client;
            }
            if (!this.config || !this.config["url"]) {
                throw new Error("Missing MongoDB-URL ...");
            }
            const client = new MongoClient(this.config["url"], {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverApi: ServerApiVersion.v1,
            });
            try {
                yield client.connect();
            }
            catch (e) {
                throw e;
            }
            return client;
        });
    }
    close(client) {
        return __awaiter(this, void 0, void 0, function* () {
            if (client) {
                yield client.close();
            }
            client = null;
        });
    }
    handleQueryBuilder(client, queryBuilder) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            const aggregation = [];
            // Match
            const match = {};
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
            const sort = {};
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
                return yield client
                    .db((_a = queryBuilder.database) !== null && _a !== void 0 ? _a : null)
                    .collection(queryBuilder.queryTable)
                    .deleteMany(match);
            }
            else if (queryBuilder.mode === "deleteOne") {
                // Delete one action
                return yield client
                    .db((_b = queryBuilder.database) !== null && _b !== void 0 ? _b : null)
                    .collection(queryBuilder.queryTable)
                    .deleteOne(match);
            }
            else if (queryBuilder.mode === "count") {
                // Count action
                const data = yield client
                    .db((_c = queryBuilder.database) !== null && _c !== void 0 ? _c : null)
                    .collection(queryBuilder.queryTable)
                    .aggregate([...aggregation, { $group: { _id: null, count: { $sum: 1 } } }, { $project: { _id: 0 } }])
                    .toArray();
                return data && data[0] && data[0].count !== undefined ? data[0].count : 0;
            }
            else {
                // Select actions
                if (queryBuilder.mode === "first") {
                    aggregation.push({ $limit: 1 });
                }
                const data = yield client
                    .db((_d = queryBuilder.database) !== null && _d !== void 0 ? _d : null)
                    .collection(queryBuilder.queryTable)
                    .aggregate(aggregation)
                    .toArray();
                if (queryBuilder.mode === "first") {
                    return data && data[0] ? data[0] : null;
                }
                return data && data.length > 0 ? data : null;
            }
        });
    }
    execute(client, executionData) {
        return __awaiter(this, void 0, void 0, function* () {
            // Aggregation
            if (executionData.type === "aggregation") {
                return yield client
                    .db(executionData.database ? executionData.database : null)
                    .collection(executionData.table)
                    .aggregate(executionData.aggregation)
                    .toArray();
            }
            // insertOne
            else if (executionData.type === "insertOne") {
                return yield client
                    .db(executionData.database ? executionData.database : null)
                    .collection(executionData.table)
                    .insertOne(executionData.data);
            }
            // updateOne
            else if (executionData.type === "updateOne") {
                return yield client
                    .db(executionData.database ? executionData.database : null)
                    .collection(executionData.table)
                    .updateOne(executionData.filter, { $set: executionData.data });
            }
            return null;
        });
    }
    backup(client, options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const config = this.config || {};
            const backupOptions = (options === null || options === void 0 ? void 0 : options.options) || {};
            const url = backupOptions.url || config.url;
            if (!url) {
                throw new Error("MongoDB backup requires a configured url.");
            }
            const targetDir = options === null || options === void 0 ? void 0 : options.targetDir;
            if (!targetDir) {
                throw new Error("MongoDB backup requires options.targetDir.");
            }
            const binary = backupOptions.binary || "mongodump";
            const dumpDir = path_1.default.join(targetDir, backupOptions.directory || "dump");
            fs_1.default.rmSync(dumpDir, { recursive: true, force: true });
            fs_1.default.mkdirSync(dumpDir, { recursive: true });
            const args = ["--uri", url, "--out", dumpDir];
            if (backupOptions.gzip === true) {
                args.push("--gzip");
            }
            if (Array.isArray(backupOptions.args)) {
                args.push(...backupOptions.args.map((entry) => String(entry)));
            }
            const startedAt = new Date().toISOString();
            (_a = options === null || options === void 0 ? void 0 : options.log) === null || _a === void 0 ? void 0 : _a.call(options, `Running MongoDB dump into ${dumpDir}`);
            yield new Promise((resolve, reject) => {
                const child = (0, child_process_1.spawn)(binary, args, {
                    stdio: ["ignore", "pipe", "pipe"],
                });
                const handleOutput = (chunk) => {
                    var _a;
                    const message = chunk.toString("utf-8").trim();
                    if (message) {
                        for (const line of message.split(/\r?\n/)) {
                            if (line.trim() !== "") {
                                (_a = options === null || options === void 0 ? void 0 : options.log) === null || _a === void 0 ? void 0 : _a.call(options, `mongodump: ${line.trim()}`);
                            }
                        }
                    }
                };
                child.stdout.on("data", handleOutput);
                child.stderr.on("data", handleOutput);
                child.on("error", (error) => {
                    reject(new Error(error && error.code === "ENOENT"
                        ? `MongoDB backup requires '${binary}' to be installed and available in PATH.`
                        : error.message));
                });
                child.on("close", (code) => {
                    if (code === 0) {
                        resolve();
                    }
                    else {
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
        });
    }
    onModelSave(model, saveStatus) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!saveStatus) {
                return model;
            }
            // Set primary-key after insert (ObjectID)
            if (saveStatus.insertedId && model) {
                model[model.__primaryKey] = saveStatus.insertedId;
            }
            return model;
        });
    }
    objectId(val) {
        return __awaiter(this, void 0, void 0, function* () {
            return val && typeof val === "string" ? new ObjectId(val) : val ? val : new ObjectId();
        });
    }
}
exports.MongoDBDriver = MongoDBDriver;
