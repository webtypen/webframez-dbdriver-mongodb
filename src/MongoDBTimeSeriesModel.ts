import { MongoDBModel } from './MongoDBModel';

export interface TimeSeriesSample {
    ownerId: string; seriesId: string; timestamp: number; receivedAt: number;
    values: Record<string, number>; snapshot?: unknown;
}

/** Opt-in numeric time series; existing document models keep their storage. */
export class MongoDBTimeSeriesModel extends MongoDBModel {
    static ensureTable() { return this.executeModel('timeSeries', { operation: 'ensure' }); }
    static appendSample(sample: TimeSeriesSample) { return this.executeModel('timeSeries', { operation: 'append', sample }); }
    static latest(ownerId: string, seriesId: string) { return this.executeModel('timeSeries', { operation: 'latest', ownerId, seriesId }); }
    static history(ownerId: string, seriesId: string, from: number, to: number, step: number) {
        return this.executeModel('timeSeries', { operation: 'history', ownerId, seriesId, from, to, step });
    }
}
