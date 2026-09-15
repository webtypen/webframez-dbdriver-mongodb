import { ObjectId } from "mongodb";

function normalize(value: unknown): ObjectId | null {
    if (value instanceof ObjectId) return value;
    if (value === undefined || value === null) return null;
    let stringValue: string | null;
    try { stringValue = typeof value === "string" ? value : typeof value === "object" ? String(value) : null; }
    catch { return null; }
    return stringValue && /^[a-fA-F0-9]{24}$/.test(stringValue) ? new ObjectId(stringValue) : null;
}

export const mongoIdAdapter = {
    create(value?: unknown) {
        if (value === undefined || value === null) return new ObjectId();
        const id = normalize(value);
        if (!id) throw new Error("Invalid MongoDB ObjectId.");
        return id;
    },
    normalize,
    isValid: (value: unknown) => normalize(value) !== null,
    equals(left: unknown, right: unknown) {
        const a = normalize(left), b = normalize(right);
        return a !== null && b !== null && a.equals(b);
    },
};
