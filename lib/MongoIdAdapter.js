"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoIdAdapter = void 0;
const mongodb_1 = require("mongodb");
function normalize(value) {
    if (value instanceof mongodb_1.ObjectId)
        return value;
    if (value === undefined || value === null)
        return null;
    let stringValue;
    try {
        stringValue = typeof value === "string" ? value : typeof value === "object" ? String(value) : null;
    }
    catch (_a) {
        return null;
    }
    return stringValue && /^[a-fA-F0-9]{24}$/.test(stringValue) ? new mongodb_1.ObjectId(stringValue) : null;
}
exports.mongoIdAdapter = {
    create(value) {
        if (value === undefined || value === null)
            return new mongodb_1.ObjectId();
        const id = normalize(value);
        if (!id)
            throw new Error("Invalid MongoDB ObjectId.");
        return id;
    },
    normalize,
    isValid: (value) => normalize(value) !== null,
    equals(left, right) {
        const a = normalize(left), b = normalize(right);
        return a !== null && b !== null && a.equals(b);
    },
};
