import { ObjectId } from "mongodb";
declare function normalize(value: unknown): ObjectId | null;
export declare const mongoIdAdapter: {
    create(value?: unknown): ObjectId;
    normalize: typeof normalize;
    isValid: (value: unknown) => boolean;
    equals(left: unknown, right: unknown): boolean;
};
export {};
