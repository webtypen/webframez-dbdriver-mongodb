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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBDriver = void 0;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const webframez_core_1 = require("@webtypen/webframez-core");
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
