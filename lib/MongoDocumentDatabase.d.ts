import type { Db } from "mongodb";
/** All native collection access for the core's optional document capability lives here. */
export declare class MongoDocumentDatabase {
    private readonly database;
    private readonly preserveIds;
    constructor(database: Db, preserveIds?: boolean);
    collection(name: string): {
        find: (filter?: any, options?: any) => {
            toArray: () => any;
            sort: (sort: any) => any;
            skip: (count: number) => any;
            limit: (count: number) => any;
        };
        findOne: (filter: any, options?: any) => Promise<import("mongodb").WithId<import("bson").Document> | null>;
        aggregate: (stages: any[], options?: any) => {
            toArray: () => any;
            sort: (sort: any) => any;
            skip: (count: number) => any;
            limit: (count: number) => any;
        };
        countDocuments: (filter?: any, options?: any) => Promise<number>;
        insertOne: (document: any, options?: any) => Promise<import("mongodb").InsertOneResult<import("bson").Document>>;
        insertMany: (documents: any[], options?: any) => Promise<import("mongodb").InsertManyResult<import("bson").Document>>;
        updateOne: (filter: any, update: any, options?: any) => Promise<import("mongodb").UpdateResult<import("bson").Document>>;
        updateMany: (filter: any, update: any, options?: any) => Promise<import("mongodb").UpdateResult<import("bson").Document>>;
        replaceOne: (filter: any, replacement: any, options?: any) => Promise<import("mongodb").UpdateResult<import("bson").Document>>;
        deleteOne: (filter: any, options?: any) => Promise<import("mongodb").DeleteResult>;
        deleteMany: (filter: any, options?: any) => Promise<import("mongodb").DeleteResult>;
        findOneAndUpdate: (filter: any, update: any, options?: any) => Promise<import("mongodb").ModifyResult<import("bson").Document>>;
    };
}
