import type { MongoClient } from 'mongodb';
/** A bounded pending batch in the atomic head is the commit record. Replay is idempotent,
 * so standalone MongoDB installations need neither multi-document transactions nor a replica set. */
export declare function mongoTimeSeriesOperation(client: MongoClient, table: string, args: any): Promise<any>;
