import {mongoWriteDocument,mongoWriteUpdate} from "./MongoWriteDocument";
import {randomUUID} from "node:crypto";
import {mongoTimeSeriesOperation} from "./MongoTimeSeriesStore";
import { MongoDocumentDatabase } from "./MongoDocumentDatabase";
import { mongoIdAdapter } from "./MongoIdAdapter";
import { MongoClient, ServerApiVersion } from "mongodb";
import { BaseDBDriver, Model, QueryBuilder } from "@webtypen/webframez-core";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export class MongoDBDriver extends BaseDBDriver {
    client: MongoClient | null = null;

    get idAdapter():any {
        if((this.config as any)?.idStrategy!=='preserve')return mongoIdAdapter;
        const normalize=(value:any)=>typeof value==='string'&&value.length||typeof value==='number'&&Number.isFinite(value)||value?._bsontype==='ObjectId'?value:null;
        return {create:(value:any)=>{if(value==null)return randomUUID();const id=normalize(value);if(id===null)throw new Error('Invalid document ID.');return id;},normalize,isValid:(value:any)=>normalize(value)!==null,equals:(a:any,b:any)=>a?._bsontype==='ObjectId'&&b?._bsontype==='ObjectId'?a.equals(b):typeof a===typeof b&&a===b&&normalize(a)!==null};
    }

    documentStore(client: MongoClient) {
        return new MongoDocumentDatabase(client.db(),(this.config as any)?.idStrategy==='preserve');
    }


    private connecting:Promise<any>|null=null;
    async connect():Promise<any>{
        if(this.client)return this.client;
        if(!this.connecting)this.connecting=this.openConnection();
        try{return await this.connecting;}finally{this.connecting=null;}
    }
    private async openConnection(): Promise<any> {
        if (this.client) {
            return this.client;
        }

        if (!this.config || !this.config["url" as keyof {}]) {
            throw new Error("Missing MongoDB-URL ...");
        }

        const client = new MongoClient(this.config["url" as keyof {}] as string, {
            serverApi: ServerApiVersion.v1,
            ...((this.config as any)?.idStrategy==='preserve'?{promoteBuffers:true,useBigInt64:true}:{}),
        });

        try {
            await client.connect();
        } catch (e) {
            await client.close();
            throw e;
        }
        this.client = client;
        return client;
    }

    async close(client?: any) {
        client=client||this.client||(this.connecting?await this.connecting:null);
        if (client) {
            await client.close();
        }

        if(this.client===client)this.client=null;
    }

    async handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<any> {
        const collection = client.db(queryBuilder.database ?? undefined).collection(queryBuilder.queryTable);
        const operators: Record<string, string> = { '=': '$eq', '==': '$eq', '!=': '$ne', '<>': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte', 'IN': '$in', 'NOT IN': '$nin' };
        const clauses = queryBuilder.query.filter((q: any) => q.type === 'where').map((q: any) => {
            if (typeof q.column === 'object')
                return q.column;
            const name = String(q.operator || '=').trim().toUpperCase();
            if (name === 'LIKE' || name === 'ILIKE' || name === 'NOT LIKE') {
                const pattern = String(q.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
                const regex = new RegExp(`^${pattern}$`, name === 'ILIKE' ? 'i' : '');
                return { [q.column]: name === 'NOT LIKE' ? { $not: regex } : regex };
            }
            const operator = operators[name];
            if (!operator)
                throw new Error(`Unsupported MongoDB query operator: ${q.operator}`);
            return { [q.column]: operator === '$eq' ? q.value : { [operator]: q.value } };
        });
        const filter = clauses.length ? { $and: clauses } : {};
        if (queryBuilder.mode === 'delete')
            return collection.deleteMany(filter);
        if (queryBuilder.mode === 'deleteOne')
            return collection.deleteOne(filter);
        if (queryBuilder.mode === 'count')
            return collection.countDocuments(filter);
        const cursor = collection.find(filter, { projection: (queryBuilder as any).projection });
        if (queryBuilder.sort.length)
            cursor.sort(Object.fromEntries(queryBuilder.sort.map((s: any) => [s.column, s.sort === -1 || String(s.sort).toUpperCase() === 'DESC' ? -1 : 1])));
        if (queryBuilder.offsetCount)
            cursor.skip(queryBuilder.offsetCount);
        if (queryBuilder.limitCount)
            cursor.limit(queryBuilder.limitCount);
        if (queryBuilder.mode === 'first')
            return cursor.limit(1).next();
        const rows = await cursor.toArray();
        return rows.length ? rows : null;
    }
    async execute(client: any, executionData: any, options?: any) {
        const c=client.db(executionData.database || undefined).collection(executionData.table);
        if(executionData.documentMode&&executionData.type==='updateOne')return c.updateOne(executionData.filter,mongoWriteUpdate({$set:executionData.data||{}}));
        if(executionData.documentMode){executionData={...executionData,...(executionData.data!==undefined?{data:mongoWriteDocument(executionData.data)}:{}),...(executionData.update!==undefined?{update:mongoWriteUpdate(executionData.update)}:{})};}
        if(executionData.type==='timeSeries')return mongoTimeSeriesOperation(client,executionData.table,executionData);
        if(executionData.type==='modelEnsureTable') {try{await client.db().createCollection(executionData.table);}catch(error:any){if(error.code!==48)throw error;}return;}
        if(executionData.type==='modelCreateIndex'||executionData.type==='modelMaterializeIndex') {
            if(Object.keys(executionData.key).length===1&&executionData.key._id===1)return '_id_';
            const {materialized,...indexOptions}=options||{};return c.createIndex(executionData.key,indexOptions);
        }
        if(executionData.type==='modelCreateMany') {
            if(!executionData.data.length)return {acknowledged:true,insertedCount:0,insertedIds:{}};
            const docs=executionData.data.map((doc:any)=>executionData.documentMode&&doc._id==null?{...doc,_id:this.idAdapter.create()}:doc);
            return c.insertMany(docs,options);
        }
        if(executionData.type==='modelUpdate') {const {many,...opts}=options||{};return many?c.updateMany(executionData.filter,executionData.update,opts):c.updateOne(executionData.filter,executionData.update,opts);}
        if(executionData.type==='modelUpdateReturning')return c.findOneAndUpdate(executionData.filter,executionData.update,{...options,includeResultMetadata:false});
        if(executionData.type==='modelDelete')return options?.many?c.deleteMany(executionData.filter):c.deleteOne(executionData.filter);
        if(executionData.type==='insertOne'&&executionData.documentMode){
            const data={...executionData.data};const primaryKey=executionData.primaryKey||'_id';if(data[primaryKey]==null||data[primaryKey]==='')data[primaryKey]=this.idAdapter.create();return c.insertOne(data);
        }
        // Aggregation
        if (executionData.type === "aggregation") {
            return await client
                .db(executionData.database ? executionData.database : null)
                .collection(executionData.table)
                .aggregate(executionData.aggregation, options)
                .toArray();
        }

        // insertOne
        else if (executionData.type === "insertOne") {
            return await client
                .db(executionData.database ? executionData.database : null)
                .collection(executionData.table)
                .insertOne(executionData.data);
        }

        // updateOne
        else if (executionData.type === "updateOne") {
            return await client
                .db(executionData.database ? executionData.database : null)
                .collection(executionData.table)
                .updateOne(executionData.filter, { $set: executionData.data });
        }

        throw new Error(`Unsupported MongoDB execution type: ${executionData.type}`);
    }

    async backup(client: any, options: any): Promise<any> {
        const config: any = this.config || {};
        const backupOptions = options?.options || {};
        const url = backupOptions.url || config.url;
        if (!url) {
            throw new Error("MongoDB backup requires a configured url.");
        }

        const targetDir = options?.targetDir;
        if (!targetDir) {
            throw new Error("MongoDB backup requires options.targetDir.");
        }

        const binary = backupOptions.binary || "mongodump";
        const dumpDir = path.join(targetDir, backupOptions.directory || "dump");
        fs.rmSync(dumpDir, { recursive: true, force: true });
        fs.mkdirSync(dumpDir, { recursive: true });

        const args = ["--uri", url, "--out", dumpDir];
        if (backupOptions.gzip === true) {
            args.push("--gzip");
        }
        if (Array.isArray(backupOptions.args)) {
            args.push(...backupOptions.args.map((entry: any) => String(entry)));
        }

        const startedAt = new Date().toISOString();
        options?.log?.(`Running MongoDB dump into ${dumpDir}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(binary, args, {
                stdio: ["ignore", "pipe", "pipe"],
            });

            const handleOutput = (chunk: Buffer) => {
                const message = chunk.toString("utf-8").trim();
                if (message) {
                    for (const line of message.split(/\r?\n/)) {
                        if (line.trim() !== "") {
                            options?.log?.(`mongodump: ${line.trim()}`);
                        }
                    }
                }
            };

            child.stdout.on("data", handleOutput);
            child.stderr.on("data", handleOutput);
            child.on("error", (error) => {
                reject(
                    new Error(
                        error && (error as any).code === "ENOENT"
                            ? `MongoDB backup requires '${binary}' to be installed and available in PATH.`
                            : error.message,
                    ),
                );
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`MongoDB dump failed with exit code ${code}.`));
                }
            });
        });

        const endedAt = new Date().toISOString();
        return {
            driver: "mongodb",
            binary: binary,
            path: dumpDir,
            gzip: backupOptions.gzip === true,
            startedAt: startedAt,
            endedAt: endedAt,
        };
    }

    async onModelSave(model: Model, saveStatus: any | null | undefined) {
        if (!saveStatus) {
            return model;
        }

        // Set primary-key after insert (ObjectID)
        if (saveStatus.insertedId && model) {
            model[model.__primaryKey] = saveStatus.insertedId;
        }
        return model;
    }

    async objectId(val?: any) {
        return this.idAdapter.create(val);
    }
}
