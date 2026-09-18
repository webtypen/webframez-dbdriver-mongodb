"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoTimeSeriesOperation = void 0;
const node_crypto_1 = require("node:crypto");
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const key = (values) => (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(values)).digest('hex');
/** A bounded pending batch in the atomic head is the commit record. Replay is idempotent,
 * so standalone MongoDB installations need neither multi-document transactions nor a replica set. */
function mongoTimeSeriesOperation(client, table, args) {
    var _a, e_1, _b, _c;
    var _d;
    return __awaiter(this, void 0, void 0, function* () {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table))
            throw new Error('Invalid time-series table');
        const rows = client.db().collection(table), heads = client.db().collection(table + '_latest');
        const drain = (head) => __awaiter(this, void 0, void 0, function* () {
            if (!(head === null || head === void 0 ? void 0 : head.pending))
                return;
            const pending = head.pending;
            yield rows.bulkWrite(pending.rows.map((row) => ({ updateOne: { filter: { owner_id: row.owner_id, series_id: row.series_id, metric: row.metric, resolution: row.resolution, time: row.time }, update: { $setOnInsert: row }, upsert: true } })), { ordered: true });
            yield heads.updateOne({ _id: head._id, 'pending.id': pending.id }, { $unset: { pending: '' } });
        });
        if (args.operation === 'ensure') {
            yield rows.createIndex({ owner_id: 1, series_id: 1, metric: 1, resolution: 1, time: 1 }, { unique: true });
            yield rows.createIndex({ owner_id: 1, series_id: 1, time: 1 });
            yield heads.createIndex({ owner_id: 1, series_id: 1 }, { unique: true });
            return;
        }
        if (args.operation === 'flush') {
            try {
                for (var _e = true, _f = __asyncValues(heads.find({ pending: { $exists: true } })), _g; _g = yield _f.next(), _a = _g.done, !_a;) {
                    _c = _g.value;
                    _e = false;
                    try {
                        const head = _c;
                        yield drain(head);
                    }
                    finally {
                        _e = true;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return;
        }
        if (args.operation === 'append') {
            const s = args.sample, entries = Object.entries((s === null || s === void 0 ? void 0 : s.values) || {});
            if (!(s === null || s === void 0 ? void 0 : s.ownerId) || !s.seriesId || !finite(s.timestamp) || !finite(s.receivedAt) || !entries.length || entries.length > 256 || entries.some(([k, v]) => k.length > 256 || !finite(v)))
                throw new Error('Invalid time-series sample');
            // Serialization must succeed before publishing the commit record.
            const snapshot = JSON.stringify((_d = s.snapshot) !== null && _d !== void 0 ? _d : null), id = key([s.ownerId, s.seriesId]);
            for (let attempt = 0; attempt < 100; attempt++) {
                const previous = yield heads.findOne({ owner_id: s.ownerId, series_id: s.seriesId });
                if (previous === null || previous === void 0 ? void 0 : previous.pending) {
                    yield drain(previous);
                    continue;
                }
                if (previous && (s.timestamp <= previous.time || s.receivedAt - previous.received_at < 10000))
                    return { accepted: false };
                const pending = { id: key([s.ownerId, s.seriesId, s.timestamp]), rows: entries.map(([metric, value]) => ({ owner_id: s.ownerId, series_id: s.seriesId, metric, resolution: 0, time: s.timestamp, total: value, minimum: value, maximum: value, samples: 1 })) };
                const next = { owner_id: s.ownerId, series_id: s.seriesId, time: s.timestamp, received_at: s.receivedAt, snapshot, pending };
                if (previous) {
                    const result = yield heads.updateOne({ _id: previous._id, time: previous.time, received_at: previous.received_at, pending: { $exists: false } }, { $set: next });
                    if (!result.matchedCount)
                        continue;
                }
                else {
                    try {
                        yield heads.insertOne(Object.assign({ _id: id }, next));
                    }
                    catch (error) {
                        if (error.code === 11000)
                            continue;
                        throw error;
                    }
                }
                yield drain(Object.assign({ _id: (previous === null || previous === void 0 ? void 0 : previous._id) || id }, next));
                return { accepted: true };
            }
            throw new Error('Concurrent telemetry update could not settle; retry the sample.');
        }
        const scope = { owner_id: args.ownerId, series_id: args.seriesId };
        const head = yield heads.findOne(scope);
        yield drain(head);
        if (args.operation === 'latest')
            return head ? { time: head.time, received_at: head.received_at, snapshot: head.snapshot ? JSON.parse(head.snapshot) : null } : null;
        if (args.operation === 'history') {
            const { from, to, step } = args;
            if (![from, to, step].every(finite) || from >= to || step < 30000 || (to - from) / step > 1500)
                throw new Error('Unbounded time-series query');
            return rows.aggregate([
                { $match: Object.assign(Object.assign({}, scope), { time: Object.assign({ $gte: from, $lt: to }, (head ? { $lte: head.time } : {})) }) },
                { $group: { _id: { metric: '$metric', time: { $multiply: [{ $floor: { $divide: ['$time', step] } }, step] } }, total: { $sum: '$total' }, minimum: { $min: '$minimum' }, maximum: { $max: '$maximum' }, samples: { $sum: '$samples' }, resolution: { $max: '$resolution' } } },
                { $project: { _id: 0, metric: '$_id.metric', time: '$_id.time', average: { $divide: ['$total', '$samples'] }, minimum: 1, maximum: 1, samples: 1, resolution: 1 } }, { $sort: { time: 1, metric: 1 } }
            ]).toArray();
        }
        throw new Error('Unknown time-series operation');
    });
}
exports.mongoTimeSeriesOperation = mongoTimeSeriesOperation;
