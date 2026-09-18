import {mongoWriteDocument,mongoWriteUpdate} from "./MongoWriteDocument";
import type { Db } from "mongodb";

const cursorAdapter = (cursor: any) => ({
    toArray: () => cursor.toArray(),
    sort: (sort: any) => cursorAdapter(cursor.sort(sort)),
    skip: (count: number) => cursorAdapter(cursor.skip(count)),
    limit: (count: number) => cursorAdapter(cursor.limit(count)),
});

/** All native collection access for the core's optional document capability lives here. */
export class MongoDocumentDatabase {
    constructor(private readonly database: Db,private readonly preserveIds=false) {}

    collection(name: string) {
        const collection = this.database.collection(name);
        const document=(value:any)=>this.preserveIds?mongoWriteDocument(value):value;
        const modifier=(value:any)=>this.preserveIds?mongoWriteUpdate(value):value;
        return {
            find: (filter: any = {}, options?: any) => cursorAdapter(collection.find(filter, options)),
            findOne: (filter: any, options?: any) => collection.findOne(filter, options),
            aggregate: (stages: any[], options?: any) => cursorAdapter(collection.aggregate(stages, options)),
            countDocuments: (filter: any = {}, options?: any) => collection.countDocuments(filter, options),
            insertOne: (document: any, options?: any) => collection.insertOne(this.preserveIds?mongoWriteDocument(document):document, options),
            insertMany: (documents: any[], options?: any) => collection.insertMany(documents.map(document), options),
            updateOne: (filter: any, update: any, options?: any) => collection.updateOne(filter, modifier(update), options),
            updateMany: (filter: any, update: any, options?: any) => collection.updateMany(filter, modifier(update), options),
            replaceOne: (filter: any, replacement: any, options?: any) => collection.replaceOne(filter, document(replacement), options),
            deleteOne: (filter: any, options?: any) => collection.deleteOne(filter, options),
            deleteMany: (filter: any, options?: any) => collection.deleteMany(filter, options),
            // A single native operation is essential: concurrent workers must never claim the same job.
            findOneAndUpdate: (filter: any, update: any, options?: any) => collection.findOneAndUpdate(filter, modifier(update), {
                ...options, includeResultMetadata: false,
            }),
        };
    }
}
