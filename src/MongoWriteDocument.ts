/** MongoDB has no portable JS-undefined value. Optional object properties are omitted
 * only in write payloads; query/tenant filters must never be stripped. */
export function mongoWriteDocument(value:any):any {
    if(Array.isArray(value))return value.map(entry=>entry===undefined?null:mongoWriteDocument(entry));
    if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined).map(([key,entry])=>[key,mongoWriteDocument(entry)]));
    return value;
}
export function mongoWriteUpdate(update:any):any {
    if(Array.isArray(update))return update;
    const result=mongoWriteDocument(update);
    for(const [key,value] of Object.entries(update?.$set||{}))if(value===undefined){result.$unset={...result.$unset,[key]:''};}
    return result;
}
