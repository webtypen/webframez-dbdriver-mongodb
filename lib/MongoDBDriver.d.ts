declare const MongoClient: any;
import { Model, QueryBuilder } from "../../webframez-core";
import { BaseDBDriver } from "../../webframez-core/src/Database/BaseDBDriver";
export declare class MongoDBDriver extends BaseDBDriver {
    client: typeof MongoClient;
    connect(): Promise<any>;
    close(client: any): Promise<void>;
    handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<any>;
    execute(client: any, executionData: any): Promise<any>;
    onModelSave(model: Model, saveStatus: any | null | undefined): Promise<Model>;
}
export {};
