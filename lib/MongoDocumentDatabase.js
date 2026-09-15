"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDocumentDatabase = void 0;
const cursorAdapter = (cursor) => ({
    toArray: () => cursor.toArray(),
    sort: (sort) => cursorAdapter(cursor.sort(sort)),
    skip: (count) => cursorAdapter(cursor.skip(count)),
    limit: (count) => cursorAdapter(cursor.limit(count)),
});
/** All native collection access for the core's optional document capability lives here. */
class MongoDocumentDatabase {
    constructor(database) {
        this.database = database;
    }
    collection(name) {
        const collection = this.database.collection(name);
        return {
            find: (filter = {}, options) => cursorAdapter(collection.find(filter, options)),
            findOne: (filter, options) => collection.findOne(filter, options),
            aggregate: (stages, options) => cursorAdapter(collection.aggregate(stages, options)),
            countDocuments: (filter = {}, options) => collection.countDocuments(filter, options),
            insertOne: (document, options) => collection.insertOne(document, options),
            insertMany: (documents, options) => collection.insertMany(documents, options),
            updateOne: (filter, update, options) => collection.updateOne(filter, update, options),
            updateMany: (filter, update, options) => collection.updateMany(filter, update, options),
            replaceOne: (filter, replacement, options) => collection.replaceOne(filter, replacement, options),
            deleteOne: (filter, options) => collection.deleteOne(filter, options),
            deleteMany: (filter, options) => collection.deleteMany(filter, options),
            // A single native operation is essential: concurrent workers must never claim the same job.
            findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, update, Object.assign(Object.assign({}, options), { includeResultMetadata: false })),
        };
    }
}
exports.MongoDocumentDatabase = MongoDocumentDatabase;
