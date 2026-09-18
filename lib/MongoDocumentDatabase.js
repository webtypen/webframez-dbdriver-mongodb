"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDocumentDatabase = void 0;
const MongoWriteDocument_1 = require("./MongoWriteDocument");
const cursorAdapter = (cursor) => ({
    toArray: () => cursor.toArray(),
    sort: (sort) => cursorAdapter(cursor.sort(sort)),
    skip: (count) => cursorAdapter(cursor.skip(count)),
    limit: (count) => cursorAdapter(cursor.limit(count)),
});
/** All native collection access for the core's optional document capability lives here. */
class MongoDocumentDatabase {
    constructor(database, preserveIds = false) {
        this.database = database;
        this.preserveIds = preserveIds;
    }
    collection(name) {
        const collection = this.database.collection(name);
        const document = (value) => this.preserveIds ? (0, MongoWriteDocument_1.mongoWriteDocument)(value) : value;
        const modifier = (value) => this.preserveIds ? (0, MongoWriteDocument_1.mongoWriteUpdate)(value) : value;
        return {
            find: (filter = {}, options) => cursorAdapter(collection.find(filter, options)),
            findOne: (filter, options) => collection.findOne(filter, options),
            aggregate: (stages, options) => cursorAdapter(collection.aggregate(stages, options)),
            countDocuments: (filter = {}, options) => collection.countDocuments(filter, options),
            insertOne: (document, options) => collection.insertOne(this.preserveIds ? (0, MongoWriteDocument_1.mongoWriteDocument)(document) : document, options),
            insertMany: (documents, options) => collection.insertMany(documents.map(document), options),
            updateOne: (filter, update, options) => collection.updateOne(filter, modifier(update), options),
            updateMany: (filter, update, options) => collection.updateMany(filter, modifier(update), options),
            replaceOne: (filter, replacement, options) => collection.replaceOne(filter, document(replacement), options),
            deleteOne: (filter, options) => collection.deleteOne(filter, options),
            deleteMany: (filter, options) => collection.deleteMany(filter, options),
            // A single native operation is essential: concurrent workers must never claim the same job.
            findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, modifier(update), Object.assign(Object.assign({}, options), { includeResultMetadata: false })),
        };
    }
}
exports.MongoDocumentDatabase = MongoDocumentDatabase;
