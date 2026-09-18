import { Model, QueryBuilder } from "@webtypen/webframez-core";
/** Model queries return actual models, including for legacy document_json tables. */
export declare class MongoDBModelQuery extends QueryBuilder {
    documentMode: boolean;
    projection?: Record<string, any>;
    select(projection?: Record<string, any>): this;
    orderBy(column: any, direction?: any): this;
    get(options?: any): Promise<any[]>;
}
/** Core Model with MongoDB document storage and transactional conditional writes. */
export declare class MongoDBModel extends Model {
    constructor();
    toJSON(): object;
    static query(filter?: Record<string, any>): MongoDBModelQuery;
    static where(column: any, operator: any, value: any, table?: string): MongoDBModelQuery;
    static orderBy(column: any, direction?: any, table?: string): MongoDBModelQuery;
    static get(options?: any, table?: string): Promise<any[]>;
    static first(options?: any, table?: string): Promise<any>;
    static executeModel(type: string, data?: any, options?: any): Promise<any>;
    /** Insert explicitly, including caller-assigned UUIDs; save() keeps Core update semantics. */
    static create<T extends typeof MongoDBModel>(this: T, data: Record<string, any>): Promise<InstanceType<T>>;
    static aggregate(stages: any[], options?: any, table?: string): Promise<any>;
    static createMany(data: Record<string, any>[]): Promise<any>;
    static updateOneWhere(filter: any, update: any, options?: any): Promise<any>;
    static updateManyWhere(filter: any, update: any, options?: any): Promise<any>;
    static updateReturning(filter: any, update: any, options?: any): Promise<any>;
    static deleteOneWhere(filter: any): Promise<any>;
    static deleteManyWhere(filter: any): Promise<any>;
    static ensureTable(): Promise<any>;
    static materializeIndex(key: any, options?: any): Promise<any>;
    static createIndex(key: any, options?: any): Promise<any>;
    save(): Promise<any>;
    update(data: Record<string, any>): Promise<void>;
    delete(): Promise<boolean>;
}
