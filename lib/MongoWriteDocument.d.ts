/** MongoDB has no portable JS-undefined value. Optional object properties are omitted
 * only in write payloads; query/tenant filters must never be stripped. */
export declare function mongoWriteDocument(value: any): any;
export declare function mongoWriteUpdate(update: any): any;
