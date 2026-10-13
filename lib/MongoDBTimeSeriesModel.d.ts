import { MongoDBModel } from './MongoDBModel';
export interface TimeSeriesSample {
    ownerId: string;
    seriesId: string;
    timestamp: number;
    receivedAt: number;
    values: Record<string, number>;
    snapshot?: unknown;
}
/** Opt-in numeric time series; existing document models keep their storage. */
export declare class MongoDBTimeSeriesModel extends MongoDBModel {
    static ensureTable(): Promise<any>;
    static appendSample(sample: TimeSeriesSample): Promise<any>;
    static latest(ownerId: string, seriesId: string, since?: number): Promise<any>;
    static series(limit?: number, after?: {
        ownerId: string;
        seriesId: string;
    }): Promise<any>;
    static capabilities(): Promise<any>;
    static retentionStatus(ownerId: string, seriesId: string, now: number): Promise<any>;
    static maintain(ownerId: string, seriesId: string, now: number, options?: {
        maxBuckets?: number;
        maxDurationMs?: number;
    }): Promise<any>;
    static history(ownerId: string, seriesId: string, from: number, to: number, step: number, metrics?: string[], excludePrefix?: string): Promise<any>;
}
