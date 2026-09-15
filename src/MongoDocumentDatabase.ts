import type { Db } from "mongodb";

const cursorAdapter = (cursor: any) => ({
    toArray: () => cursor.toArray(),
    sort: (sort: any) => cursorAdapter(cursor.sort(sort)),
    skip: (count: number) => cursorAdapter(cursor.skip(count)),
    limit: (count: number) => cursorAdapter(cursor.limit(count)),
});

/** All native collection access for the core's optional document capability lives here. */
export class MongoDocumentDatabase {
    constructor(private readonly database: Db) {}

    collection(name: string) {
        const collection = this.database.collection(name);
        return {
            find: (filter: any = {}, options?: any) => cursorAdapter(collection.find(filter, options)),
            findOne: (filter: any, options?: any) => collection.findOne(filter, options),
            aggregate: (stages: any[], options?: any) => cursorAdapter(collection.aggregate(stages, options)),
            countDocuments: (filter: any = {}, options?: any) => collection.countDocuments(filter, options),
            insertOne: (document: any, options?: any) => collection.insertOne(document, options),
            insertMany: (documents: any[], options?: any) => collection.insertMany(documents, options),
            updateOne: (filter: any, update: any, options?: any) => collection.updateOne(filter, update, options),
            updateMany: (filter: any, update: any, options?: any) => collection.updateMany(filter, update, options),
            replaceOne: (filter: any, replacement: any, options?: any) => collection.replaceOne(filter, replacement, options),
            deleteOne: (filter: any, options?: any) => collection.deleteOne(filter, options),
            deleteMany: (filter: any, options?: any) => collection.deleteMany(filter, options),
            // A single native operation is essential: concurrent workers must never claim the same job.
            findOneAndUpdate: (filter: any, update: any, options?: any) => collection.findOneAndUpdate(filter, update, {
                ...options, includeResultMetadata: false,
            }),
        };
    }
}
