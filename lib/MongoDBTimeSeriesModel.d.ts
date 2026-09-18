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
    static latest(ownerId: string, seriesId: string): Promise<any>;
    static history(ownerId: string, seriesId: string, from: number, to: number, step: number): Promise<any>;
}
