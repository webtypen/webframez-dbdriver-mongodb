declare const MongoClient: any;
import { BaseDBDriver, Model, QueryBuilder } from "@webtypen/webframez-core";
export declare class MongoDBDriver extends BaseDBDriver {
    client: typeof MongoClient;
    connect(): Promise<any>;
    close(client: any): Promise<void>;
    handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<any>;
    execute(client: any, executionData: any): Promise<any>;
    backup(client: any, options: any): Promise<{
        driver: string;
        binary: any;
        path: string;
        gzip: boolean;
        startedAt: string;
        endedAt: string;
    }>;
    onModelSave(model: Model, saveStatus: any | null | undefined): Promise<Model>;
    objectId(val?: any): Promise<any>;
}
export {};
