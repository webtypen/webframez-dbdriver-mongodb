import { DBConnection, Model, QueryBuilder } from "@webtypen/webframez-core";

/** Model queries return actual models, including for legacy document_json tables. */
export class MongoDBModelQuery extends QueryBuilder {
    documentMode = true;
    projection?: Record<string, any>;
    select(projection?: Record<string, any>) { this.projection = projection; return this; }
    orderBy(column: any, direction?: any): this {
        if (column && typeof column === "object") {
            for (const [key, value] of Object.entries(column)) super.orderBy(key, value);
        } else super.orderBy(column, direction);
        return this;
    }
    async get(options?: any): Promise<any[]> { return (await super.get(options)) || []; }
}

/** Core Model with MongoDB document storage and transactional conditional writes. */
export class MongoDBModel extends Model {
    constructor() {
        super();
        // Model bookkeeping must never become part of a copied domain snapshot.
        for (const key of this.__unmappedSystem) {
            if (Object.prototype.hasOwnProperty.call(this, key)) Object.defineProperty(this, key, { enumerable: false });
        }
        Object.defineProperty(this, "__documentMode", { value: true, enumerable: false });
        this.__unmappedSystem.push("__documentMode");
    }
    toJSON() { return this.toArray(); }
    static query(filter: Record<string, any> = {}): MongoDBModelQuery {
        const model = new this();
        const query = new MongoDBModelQuery();
        query.setModelMapping(this).table(model.__table).where(filter, "=", undefined);
        return query;
    }
    static where(column: any, operator: any, value: any, table?: string): MongoDBModelQuery {
        const query = this.query();
        if (table) query.table(table);
        query.where(column, operator, value);
        return query;
    }
    static orderBy(column: any, direction?: any, table?: string): MongoDBModelQuery {
        const query = this.query();
        if (table) query.table(table);
        return query.orderBy(column, direction);
    }
    static async get(options?: any, table?: string) { const query = this.query(); if (table) query.table(table); return query.get(options); }
    static async first(options?: any, table?: string) { const query = this.query(); if (table) query.table(table); return query.first(options); }
    static async executeModel(type: string, data: any = {}, options?: any) {
        const model = new this();
        return DBConnection.execute({ ...data, type, table: model.__table, primaryKey: model.__primaryKey, documentMode: true }, model.__connection, options);
    }
    /** Insert explicitly, including caller-assigned UUIDs; save() keeps Core update semantics. */
    static async create<T extends typeof MongoDBModel>(this: T, data: Record<string, any>): Promise<InstanceType<T>> {
        const model = Object.assign(new this(), data);
        const status = await this.executeModel("insertOne", { data: model.getModelData() });
        return (await DBConnection.getDriver(model.__connection)).onModelSave(model, status);
    }
    static async aggregate(stages: any[], options?: any, table?: string) {
        const model = new this();
        return DBConnection.execute({ type: "aggregation", table: table || model.__table, aggregation: stages, documentMode: true }, model.__connection, options);
    }
    static async createMany(data: Record<string, any>[]) {
        const models = data.map(row => Object.assign(new this(), row));
        return this.executeModel("modelCreateMany", { data: models.map(model => model.getModelData()) });
    }
    static updateOneWhere(filter: any, update: any, options?: any) { return this.executeModel("modelUpdate", { filter, update }, { ...options, many: false }); }
    static updateManyWhere(filter: any, update: any, options?: any) { return this.executeModel("modelUpdate", { filter, update }, { ...options, many: true }); }
    static async updateReturning(filter: any, update: any, options?: any) {
        const row = await this.executeModel("modelUpdateReturning", { filter, update }, options);
        return row ? DBConnection.mapDataToModel(this, row) : null;
    }
    static deleteOneWhere(filter: any) { return this.executeModel("modelDelete", { filter }, { many: false }); }
    static deleteManyWhere(filter: any) { return this.executeModel("modelDelete", { filter }, { many: true }); }
    static ensureTable() { return this.executeModel("modelEnsureTable"); }
    static materializeIndex(key: any, options: any = {}) { return this.executeModel("modelMaterializeIndex", {key}, options); }
    static createIndex(key: any, options?: any) { return this.executeModel("modelCreateIndex", { key }, options); }
    async save() {
        const status = await DBConnection.execute({ type: this[this.__primaryKey]!==undefined && this[this.__primaryKey]!==null && this[this.__primaryKey]!=="" ? "updateOne" : "insertOne", table: this.__table, primaryKey: this.__primaryKey, filter: { [this.__primaryKey]: this[this.__primaryKey] }, data: this.getModelData(), documentMode: true }, this.__connection);
        return (await DBConnection.getDriver(this.__connection)).onModelSave(this, status);
    }
    async update(data: Record<string, any>) {
        if (this[this.__primaryKey]===undefined || this[this.__primaryKey]===null || this[this.__primaryKey]==="") throw new Error("Missing primary-key-value for update ...");
        await DBConnection.execute({ type: "updateOne", table: this.__table, primaryKey: this.__primaryKey, filter: { [this.__primaryKey]: this[this.__primaryKey] }, data, documentMode: true }, this.__connection);
        Object.assign(this, data);
    }
    async delete() {
        if (this[this.__primaryKey]===undefined || this[this.__primaryKey]===null || this[this.__primaryKey]==="") return false;
        await DBConnection.execute({ type: "modelDelete", table: this.__table, filter: { [this.__primaryKey]: this[this.__primaryKey] }, documentMode: true }, this.__connection, { many: false });
        return true;
    }
}
