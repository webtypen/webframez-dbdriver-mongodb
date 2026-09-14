import { MongoClient } from "mongodb";
import { BaseDBDriver, Model, QueryBuilder } from "@webtypen/webframez-core";
export declare class MongoDBDriver extends BaseDBDriver {
    client: MongoClient | null;
    connect(): Promise<any>;
    close(client: any): Promise<void>;
    handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<any>;
    execute(client: any, executionData: any, options?: any): Promise<any>;
    backup(client: any, options: any): Promise<any>;
    onModelSave(model: Model, saveStatus: any | null | undefined): Promise<Model>;
    objectId(val?: any): Promise<any>;
}
