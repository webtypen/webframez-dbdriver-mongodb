"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBTimeSeriesModel = void 0;
const MongoDBModel_1 = require("./MongoDBModel");
/** Opt-in numeric time series; existing document models keep their storage. */
class MongoDBTimeSeriesModel extends MongoDBModel_1.MongoDBModel {
    static ensureTable() { return this.executeModel('timeSeries', { operation: 'ensure' }); }
    static appendSample(sample) { return this.executeModel('timeSeries', { operation: 'append', sample }); }
    static latest(ownerId, seriesId) { return this.executeModel('timeSeries', { operation: 'latest', ownerId, seriesId }); }
    static history(ownerId, seriesId, from, to, step) {
        return this.executeModel('timeSeries', { operation: 'history', ownerId, seriesId, from, to, step });
    }
}
exports.MongoDBTimeSeriesModel = MongoDBTimeSeriesModel;
