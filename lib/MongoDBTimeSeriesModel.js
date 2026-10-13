"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBTimeSeriesModel = void 0;
const MongoDBModel_1 = require("./MongoDBModel");
/** Opt-in numeric time series; existing document models keep their storage. */
class MongoDBTimeSeriesModel extends MongoDBModel_1.MongoDBModel {
    static ensureTable() { return this.executeModel('timeSeries', { operation: 'ensure' }); }
    static appendSample(sample) { return this.executeModel('timeSeries', { operation: 'append', sample }); }
    static latest(ownerId, seriesId, since) { return this.executeModel('timeSeries', { operation: 'latest', ownerId, seriesId, since }); }
    static series(limit = 100, after) { return this.executeModel('timeSeries', { operation: 'series', limit, after }); }
    static capabilities() { return this.executeModel('timeSeries', { operation: 'capabilities' }); }
    static retentionStatus(ownerId, seriesId, now) { return this.executeModel('timeSeries', { operation: 'retentionStatus', ownerId, seriesId, now }); }
    static maintain(ownerId, seriesId, now, options) { return this.executeModel('timeSeries', { operation: 'maintain', ownerId, seriesId, now, options }); }
    static history(ownerId, seriesId, from, to, step, metrics, excludePrefix) {
        return this.executeModel('timeSeries', { operation: 'history', ownerId, seriesId, from, to, step, metrics, excludePrefix });
    }
}
exports.MongoDBTimeSeriesModel = MongoDBTimeSeriesModel;
