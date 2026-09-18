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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBDriver = void 0;
const MongoWriteDocument_1 = require("./MongoWriteDocument");
const node_crypto_1 = require("node:crypto");
const MongoTimeSeriesStore_1 = require("./MongoTimeSeriesStore");
const MongoDocumentDatabase_1 = require("./MongoDocumentDatabase");
const MongoIdAdapter_1 = require("./MongoIdAdapter");
const mongodb_1 = require("mongodb");
const webframez_core_1 = require("@webtypen/webframez-core");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
class MongoDBDriver extends webframez_core_1.BaseDBDriver {
    constructor() {
        super(...arguments);
        this.client = null;
        this.connecting = null;
    }
    get idAdapter() {
        var _a;
        if (((_a = this.config) === null || _a === void 0 ? void 0 : _a.idStrategy) !== 'preserve')
            return MongoIdAdapter_1.mongoIdAdapter;
        const normalize = (value) => typeof value === 'string' && value.length || typeof value === 'number' && Number.isFinite(value) || (value === null || value === void 0 ? void 0 : value._bsontype) === 'ObjectId' ? value : null;
        return { create: (value) => { if (value == null)
                return (0, node_crypto_1.randomUUID)(); const id = normalize(value); if (id === null)
                throw new Error('Invalid document ID.'); return id; }, normalize, isValid: (value) => normalize(value) !== null, equals: (a, b) => (a === null || a === void 0 ? void 0 : a._bsontype) === 'ObjectId' && (b === null || b === void 0 ? void 0 : b._bsontype) === 'ObjectId' ? a.equals(b) : typeof a === typeof b && a === b && normalize(a) !== null };
    }
    documentStore(client) {
        var _a;
        return new MongoDocumentDatabase_1.MongoDocumentDatabase(client.db(), ((_a = this.config) === null || _a === void 0 ? void 0 : _a.idStrategy) === 'preserve');
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client)
                return this.client;
            if (!this.connecting)
                this.connecting = this.openConnection();
            try {
                return yield this.connecting;
            }
            finally {
                this.connecting = null;
            }
        });
    }
    openConnection() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client) {
                return this.client;
            }
            if (!this.config || !this.config["url"]) {
                throw new Error("Missing MongoDB-URL ...");
            }
            const client = new mongodb_1.MongoClient(this.config["url"], Object.assign({ serverApi: mongodb_1.ServerApiVersion.v1 }, (((_a = this.config) === null || _a === void 0 ? void 0 : _a.idStrategy) === 'preserve' ? { promoteBuffers: true, useBigInt64: true } : {})));
            try {
                yield client.connect();
            }
            catch (e) {
                yield client.close();
                throw e;
            }
            this.client = client;
            return client;
        });
    }
    close(client) {
        return __awaiter(this, void 0, void 0, function* () {
            client = client || this.client || (this.connecting ? yield this.connecting : null);
            if (client) {
                yield client.close();
            }
            if (this.client === client)
                this.client = null;
        });
    }
    handleQueryBuilder(client, queryBuilder) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const collection = client.db((_a = queryBuilder.database) !== null && _a !== void 0 ? _a : undefined).collection(queryBuilder.queryTable);
            const operators = { '=': '$eq', '==': '$eq', '!=': '$ne', '<>': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte', 'IN': '$in', 'NOT IN': '$nin' };
            const clauses = queryBuilder.query.filter((q) => q.type === 'where').map((q) => {
                if (typeof q.column === 'object')
                    return q.column;
                const name = String(q.operator || '=').trim().toUpperCase();
                if (name === 'LIKE' || name === 'ILIKE' || name === 'NOT LIKE') {
                    const pattern = String(q.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
                    const regex = new RegExp(`^${pattern}$`, name === 'ILIKE' ? 'i' : '');
                    return { [q.column]: name === 'NOT LIKE' ? { $not: regex } : regex };
                }
                const operator = operators[name];
                if (!operator)
                    throw new Error(`Unsupported MongoDB query operator: ${q.operator}`);
                return { [q.column]: operator === '$eq' ? q.value : { [operator]: q.value } };
            });
            const filter = clauses.length ? { $and: clauses } : {};
            if (queryBuilder.mode === 'delete')
                return collection.deleteMany(filter);
            if (queryBuilder.mode === 'deleteOne')
                return collection.deleteOne(filter);
            if (queryBuilder.mode === 'count')
                return collection.countDocuments(filter);
            const cursor = collection.find(filter, { projection: queryBuilder.projection });
            if (queryBuilder.sort.length)
                cursor.sort(Object.fromEntries(queryBuilder.sort.map((s) => [s.column, s.sort === -1 || String(s.sort).toUpperCase() === 'DESC' ? -1 : 1])));
            if (queryBuilder.offsetCount)
                cursor.skip(queryBuilder.offsetCount);
            if (queryBuilder.limitCount)
                cursor.limit(queryBuilder.limitCount);
            if (queryBuilder.mode === 'first')
                return cursor.limit(1).next();
            const rows = yield cursor.toArray();
            return rows.length ? rows : null;
        });
    }
    execute(client, executionData, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const c = client.db(executionData.database || undefined).collection(executionData.table);
            if (executionData.documentMode && executionData.type === 'updateOne')
                return c.updateOne(executionData.filter, (0, MongoWriteDocument_1.mongoWriteUpdate)({ $set: executionData.data || {} }));
            if (executionData.documentMode) {
                executionData = Object.assign(Object.assign(Object.assign({}, executionData), (executionData.data !== undefined ? { data: (0, MongoWriteDocument_1.mongoWriteDocument)(executionData.data) } : {})), (executionData.update !== undefined ? { update: (0, MongoWriteDocument_1.mongoWriteUpdate)(executionData.update) } : {}));
            }
            if (executionData.type === 'timeSeries')
                return (0, MongoTimeSeriesStore_1.mongoTimeSeriesOperation)(client, executionData.table, executionData);
            if (executionData.type === 'modelEnsureTable') {
                try {
                    yield client.db().createCollection(executionData.table);
                }
                catch (error) {
                    if (error.code !== 48)
                        throw error;
                }
                return;
            }
            if (executionData.type === 'modelCreateIndex' || executionData.type === 'modelMaterializeIndex') {
                if (Object.keys(executionData.key).length === 1 && executionData.key._id === 1)
                    return '_id_';
                const _a = options || {}, { materialized } = _a, indexOptions = __rest(_a, ["materialized"]);
                return c.createIndex(executionData.key, indexOptions);
            }
            if (executionData.type === 'modelCreateMany') {
                if (!executionData.data.length)
                    return { acknowledged: true, insertedCount: 0, insertedIds: {} };
                const docs = executionData.data.map((doc) => executionData.documentMode && doc._id == null ? Object.assign(Object.assign({}, doc), { _id: this.idAdapter.create() }) : doc);
                return c.insertMany(docs, options);
            }
            if (executionData.type === 'modelUpdate') {
                const _b = options || {}, { many } = _b, opts = __rest(_b, ["many"]);
                return many ? c.updateMany(executionData.filter, executionData.update, opts) : c.updateOne(executionData.filter, executionData.update, opts);
            }
            if (executionData.type === 'modelUpdateReturning')
                return c.findOneAndUpdate(executionData.filter, executionData.update, Object.assign(Object.assign({}, options), { includeResultMetadata: false }));
            if (executionData.type === 'modelDelete')
                return (options === null || options === void 0 ? void 0 : options.many) ? c.deleteMany(executionData.filter) : c.deleteOne(executionData.filter);
            if (executionData.type === 'insertOne' && executionData.documentMode) {
                const data = Object.assign({}, executionData.data);
                const primaryKey = executionData.primaryKey || '_id';
                if (data[primaryKey] == null || data[primaryKey] === '')
                    data[primaryKey] = this.idAdapter.create();
                return c.insertOne(data);
            }
            // Aggregation
            if (executionData.type === "aggregation") {
                return yield client
                    .db(executionData.database ? executionData.database : null)
                    .collection(executionData.table)
                    .aggregate(executionData.aggregation, options)
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
            throw new Error(`Unsupported MongoDB execution type: ${executionData.type}`);
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
            return this.idAdapter.create(val);
        });
    }
}
exports.MongoDBDriver = MongoDBDriver;
