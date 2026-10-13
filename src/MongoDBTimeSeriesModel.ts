import { MongoDBModel } from './MongoDBModel';

export interface TimeSeriesSample {
    ownerId: string; seriesId: string; timestamp: number; receivedAt: number;
    values: Record<string, number>; snapshot?: unknown;
}

/** Opt-in numeric time series; existing document models keep their storage. */
export class MongoDBTimeSeriesModel extends MongoDBModel {
    static ensureTable() { return this.executeModel('timeSeries', { operation: 'ensure' }); }
    static appendSample(sample: TimeSeriesSample) { return this.executeModel('timeSeries', { operation: 'append', sample }); }
    static latest(ownerId: string, seriesId: string, since?: number) { return this.executeModel('timeSeries', { operation: 'latest', ownerId, seriesId, since }); }
    static series(limit=100, after?: {ownerId:string;seriesId:string}) { return this.executeModel('timeSeries', { operation: 'series', limit, after }); }

    static capabilities() { return this.executeModel('timeSeries', { operation: 'capabilities' }); }

    static retentionStatus(ownerId:string, seriesId:string, now:number) { return this.executeModel('timeSeries', {operation:'retentionStatus',ownerId,seriesId,now}); }

    static maintain(ownerId: string, seriesId: string, now: number, options?: {maxBuckets?:number;maxDurationMs?:number}) { return this.executeModel('timeSeries', { operation: 'maintain', ownerId, seriesId, now, options }); }

    static history(ownerId: string, seriesId: string, from: number, to: number, step: number, metrics?: string[], excludePrefix?: string) {
        return this.executeModel('timeSeries', { operation: 'history', ownerId, seriesId, from, to, step, metrics, excludePrefix });
    }
}
