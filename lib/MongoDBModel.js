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
exports.MongoDBModel = exports.MongoDBModelQuery = void 0;
const webframez_core_1 = require("@webtypen/webframez-core");
/** Model queries return actual models, including for legacy document_json tables. */
class MongoDBModelQuery extends webframez_core_1.QueryBuilder {
    constructor() {
        super(...arguments);
        this.documentMode = true;
    }
    select(projection) { this.projection = projection; return this; }
    orderBy(column, direction) {
        if (column && typeof column === "object") {
            for (const [key, value] of Object.entries(column))
                super.orderBy(key, value);
        }
        else
            super.orderBy(column, direction);
        return this;
    }
    get(options) {
        const _super = Object.create(null, {
            get: { get: () => super.get }
        });
        return __awaiter(this, void 0, void 0, function* () { return (yield _super.get.call(this, options)) || []; });
    }
}
exports.MongoDBModelQuery = MongoDBModelQuery;
/** Core Model with MongoDB document storage and transactional conditional writes. */
class MongoDBModel extends webframez_core_1.Model {
    constructor() {
        super();
        // Model bookkeeping must never become part of a copied domain snapshot.
        for (const key of this.__unmappedSystem) {
            if (Object.prototype.hasOwnProperty.call(this, key))
                Object.defineProperty(this, key, { enumerable: false });
        }
        Object.defineProperty(this, "__documentMode", { value: true, enumerable: false });
        this.__unmappedSystem.push("__documentMode");
    }
    toJSON() { return this.toArray(); }
    static query(filter = {}) {
        const model = new this();
        const query = new MongoDBModelQuery();
        query.setModelMapping(this).table(model.__table).where(filter, "=", undefined);
        return query;
    }
    static where(column, operator, value, table) {
        const query = this.query();
        if (table)
            query.table(table);
        query.where(column, operator, value);
        return query;
    }
    static orderBy(column, direction, table) {
        const query = this.query();
        if (table)
            query.table(table);
        return query.orderBy(column, direction);
    }
    static get(options, table) {
        return __awaiter(this, void 0, void 0, function* () { const query = this.query(); if (table)
            query.table(table); return query.get(options); });
    }
    static first(options, table) {
        return __awaiter(this, void 0, void 0, function* () { const query = this.query(); if (table)
            query.table(table); return query.first(options); });
    }
    static executeModel(type, data = {}, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            return webframez_core_1.DBConnection.execute(Object.assign(Object.assign({}, data), { type, table: model.__table, primaryKey: model.__primaryKey, documentMode: true }), model.__connection, options);
        });
    }
    /** Insert explicitly, including caller-assigned UUIDs; save() keeps Core update semantics. */
    static create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = Object.assign(new this(), data);
            const status = yield this.executeModel("insertOne", { data: model.getModelData() });
            return (yield webframez_core_1.DBConnection.getDriver(model.__connection)).onModelSave(model, status);
        });
    }
    static aggregate(stages, options, table) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            return webframez_core_1.DBConnection.execute({ type: "aggregation", table: table || model.__table, aggregation: stages, documentMode: true }, model.__connection, options);
        });
    }
    static createMany(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const models = data.map(row => Object.assign(new this(), row));
            return this.executeModel("modelCreateMany", { data: models.map(model => model.getModelData()) });
        });
    }
    static updateOneWhere(filter, update, options) { return this.executeModel("modelUpdate", { filter, update }, Object.assign(Object.assign({}, options), { many: false })); }
    static updateManyWhere(filter, update, options) { return this.executeModel("modelUpdate", { filter, update }, Object.assign(Object.assign({}, options), { many: true })); }
    static updateReturning(filter, update, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield this.executeModel("modelUpdateReturning", { filter, update }, options);
            return row ? webframez_core_1.DBConnection.mapDataToModel(this, row) : null;
        });
    }
    static deleteOneWhere(filter) { return this.executeModel("modelDelete", { filter }, { many: false }); }
    static deleteManyWhere(filter) { return this.executeModel("modelDelete", { filter }, { many: true }); }
    static ensureTable() { return this.executeModel("modelEnsureTable"); }
    static materializeIndex(key, options = {}) { return this.executeModel("modelMaterializeIndex", { key }, options); }
    static createIndex(key, options) { return this.executeModel("modelCreateIndex", { key }, options); }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            const status = yield webframez_core_1.DBConnection.execute({ type: this[this.__primaryKey] !== undefined && this[this.__primaryKey] !== null && this[this.__primaryKey] !== "" ? "updateOne" : "insertOne", table: this.__table, primaryKey: this.__primaryKey, filter: { [this.__primaryKey]: this[this.__primaryKey] }, data: this.getModelData(), documentMode: true }, this.__connection);
            return (yield webframez_core_1.DBConnection.getDriver(this.__connection)).onModelSave(this, status);
        });
    }
    update(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this[this.__primaryKey] === undefined || this[this.__primaryKey] === null || this[this.__primaryKey] === "")
                throw new Error("Missing primary-key-value for update ...");
            yield webframez_core_1.DBConnection.execute({ type: "updateOne", table: this.__table, primaryKey: this.__primaryKey, filter: { [this.__primaryKey]: this[this.__primaryKey] }, data, documentMode: true }, this.__connection);
            Object.assign(this, data);
        });
    }
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this[this.__primaryKey] === undefined || this[this.__primaryKey] === null || this[this.__primaryKey] === "")
                return false;
            yield webframez_core_1.DBConnection.execute({ type: "modelDelete", table: this.__table, filter: { [this.__primaryKey]: this[this.__primaryKey] }, documentMode: true }, this.__connection, { many: false });
            return true;
        });
    }
}
exports.MongoDBModel = MongoDBModel;
