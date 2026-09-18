"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoWriteUpdate = exports.mongoWriteDocument = void 0;
/** MongoDB has no portable JS-undefined value. Optional object properties are omitted
 * only in write payloads; query/tenant filters must never be stripped. */
function mongoWriteDocument(value) {
    if (Array.isArray(value))
        return value.map(entry => entry === undefined ? null : mongoWriteDocument(entry));
    if (value && Object.getPrototypeOf(value) === Object.prototype)
        return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, mongoWriteDocument(entry)]));
    return value;
}
exports.mongoWriteDocument = mongoWriteDocument;
function mongoWriteUpdate(update) {
    if (Array.isArray(update))
        return update;
    const result = mongoWriteDocument(update);
    for (const [key, value] of Object.entries((update === null || update === void 0 ? void 0 : update.$set) || {}))
        if (value === undefined) {
            result.$unset = Object.assign(Object.assign({}, result.$unset), { [key]: '' });
        }
    return result;
}
exports.mongoWriteUpdate = mongoWriteUpdate;
