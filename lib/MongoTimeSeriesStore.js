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
    var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    return __awaiter(this, void 0, void 0, function* () {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table))
            throw new Error('Invalid time-series table');
        const rows = client.db().collection(table), heads = client.db().collection(table + '_latest');
        const drain = (head) => __awaiter(this, void 0, void 0, function* () {
            if (!(head === null || head === void 0 ? void 0 : head.pending))
                return;
            const pending = head.pending;
            if (pending.rows.length)
                yield rows.bulkWrite(pending.rows.map((row) => ({ updateOne: { filter: { owner_id: row.owner_id, series_id: row.series_id, metric: row.metric, resolution: row.resolution, time: row.time }, update: { $setOnInsert: row }, upsert: true } })), { ordered: true });
            if (pending.remove)
                yield rows.deleteMany({ owner_id: head.owner_id, series_id: head.series_id, resolution: pending.remove.resolution, time: { $gte: pending.remove.from, $lt: pending.remove.to } });
            yield heads.updateOne({ _id: head._id, 'pending.id': pending.id }, Object.assign({ $unset: { pending: '' } }, (pending.retention ? { $set: pending.retention } : {})));
        });
        if (args.operation === 'ensure') {
            yield rows.createIndex({ owner_id: 1, series_id: 1, metric: 1, resolution: 1, time: 1 }, { unique: true });
            yield rows.createIndex({ owner_id: 1, series_id: 1, time: 1 });
            yield heads.createIndex({ owner_id: 1, series_id: 1 }, { unique: true });
            return;
        }
        if (args.operation === 'flush') {
            try {
                for (var _s = true, _t = __asyncValues(heads.find({ pending: { $exists: true } })), _u; _u = yield _t.next(), _a = _u.done, !_a;) {
                    _c = _u.value;
                    _s = false;
                    try {
                        const head = _c;
                        yield drain(head);
                    }
                    finally {
                        _s = true;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_s && !_a && (_b = _t.return)) yield _b.call(_t);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return;
        }
        if (args.operation === 'append') {
            const s = args.sample, entries = Object.entries((s === null || s === void 0 ? void 0 : s.values) || {});
            if (!(s === null || s === void 0 ? void 0 : s.ownerId) || !s.seriesId || !finite(s.timestamp) || !finite(s.receivedAt) || !entries.length || entries.length > 1024 || entries.some(([k, v]) => k.length > 1024 || !finite(v)))
                throw new Error('Invalid time-series sample');
            // Serialization must succeed before publishing the commit record.
            const snapshot = JSON.stringify((_d = s.snapshot) !== null && _d !== void 0 ? _d : null), id = key([s.ownerId, s.seriesId]);
            for (let attempt = 0; attempt < 100; attempt++) {
                const previous = yield heads.findOne({ owner_id: s.ownerId, series_id: s.seriesId });
                if (previous === null || previous === void 0 ? void 0 : previous.pending) {
                    yield drain(previous);
                    continue;
                }
                if (previous && (s.timestamp < Math.max(previous.rawBefore || 0, previous.expiredBefore || 0) || s.timestamp <= previous.time || s.receivedAt - previous.received_at < 10000))
                    return { accepted: false };
                const pending = { id: key([s.ownerId, s.seriesId, s.timestamp]), rows: entries.map(([metric, value]) => ({ owner_id: s.ownerId, series_id: s.seriesId, metric, resolution: 0, time: s.timestamp, total: value, minimum: value, maximum: value, samples: 1 })) };
                const next = { owner_id: s.ownerId, series_id: s.seriesId, time: s.timestamp, received_at: s.receivedAt, snapshot, pending };
                if (previous) {
                    const result = yield heads.updateOne({ _id: previous._id, time: previous.time, received_at: previous.received_at, pending: { $exists: false }, retentionVersion: (_e = previous.retentionVersion) !== null && _e !== void 0 ? _e : { $exists: false }, expiredBefore: (_f = previous.expiredBefore) !== null && _f !== void 0 ? _f : { $exists: false } }, { $set: next });
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
        if (args.operation === 'capabilities')
            return { version: 2, features: ['retention.bounded.v1', 'history.metrics.v1', 'latest.since.v1'], maxMetrics: 1024 };
        if (args.operation === 'series') {
            const limit = (_g = args.limit) !== null && _g !== void 0 ? _g : 100;
            if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
                throw new Error('Invalid series page size');
            const filter = args.after ? { $or: [{ owner_id: { $gt: args.after.ownerId } }, { owner_id: args.after.ownerId, series_id: { $gt: args.after.seriesId } }] } : {};
            return heads.find(filter, { projection: { _id: 0, owner_id: 1, series_id: 1 } }).sort({ owner_id: 1, series_id: 1 }).limit(limit).toArray();
        }
        const scope = { owner_id: args.ownerId, series_id: args.seriesId };
        if (args.operation === 'maintain' || args.operation === 'retentionStatus') {
            if (!args.ownerId || !args.seriesId || !finite(args.now) || args.now < 0)
                throw new Error('Invalid retention scope');
            const maxBuckets = (_j = (_h = args.options) === null || _h === void 0 ? void 0 : _h.maxBuckets) !== null && _j !== void 0 ? _j : 4, maxDurationMs = (_l = (_k = args.options) === null || _k === void 0 ? void 0 : _k.maxDurationMs) !== null && _l !== void 0 ? _l : 100;
            if (!Number.isInteger(maxBuckets) || maxBuckets < 1 || maxBuckets > 32 || !finite(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 1000)
                throw new Error('Invalid retention budget');
            const expiry = Math.floor((args.now - 365 * 86400000) / 3600000) * 3600000;
            const stages = [[0, 300000, 48 * 3600000, 'rawBefore'], [300000, 3600000, 30 * 86400000, 'fiveBefore']];
            const obsolete = (head) => ({ $or: [{ time: { $lt: expiry } }, { resolution: 0, time: { $lt: head.rawBefore || 0 } }, { resolution: 300000, time: { $lt: head.fiveBefore || 0 } }] });
            const next = (head, oldest = false) => __awaiter(this, void 0, void 0, function* () {
                const removed = yield rows.findOne(Object.assign(Object.assign({}, scope), obsolete(head)), { sort: { time: 1 } });
                if (removed)
                    return { expired: true, from: Math.floor(removed.time / 300000) * 300000, to: (Math.floor(removed.time / 300000) + 1) * 300000 };
                let selected = null;
                for (const [source, target, age, marker] of stages) {
                    const cutoff = Math.floor((args.now - age) / target) * target;
                    const first = yield rows.findOne(Object.assign(Object.assign({}, scope), { resolution: source, time: { $gte: Math.max(head[marker] || 0, expiry), $lt: cutoff } }), { sort: { time: 1 } });
                    if (first) {
                        const bucket = { expired: false, source, target, marker, from: Math.floor(first.time / target) * target, to: (Math.floor(first.time / target) + 1) * target };
                        if (!oldest)
                            return bucket;
                        if (!selected || bucket.from < selected.from)
                            selected = bucket;
                    }
                }
                return selected;
            });
            const started = performance.now();
            let processed = 0;
            if (args.operation === 'maintain')
                for (let batch = 0; batch < maxBuckets && (batch === 0 || performance.now() - started < maxDurationMs); batch++) {
                    const previous = yield heads.findOne(scope);
                    if (!previous)
                        return { more: false, oldestDueAt: null, processed };
                    if (previous.pending) {
                        yield drain(previous);
                        processed++;
                        continue;
                    }
                    yield heads.updateOne(scope, { $max: { expiredBefore: expiry } });
                    if (previous.time < expiry)
                        yield heads.updateOne(Object.assign(Object.assign({}, scope), { time: previous.time }), { $set: { snapshot: null } });
                    const bucket = yield next(previous);
                    if (!bucket)
                        break;
                    if (bucket.expired) {
                        yield rows.deleteMany(Object.assign(Object.assign({}, scope), { $and: [obsolete(previous), { time: { $gte: bucket.from, $lt: bucket.to } }] }));
                        processed++;
                        continue;
                    }
                    const aggregates = yield rows.aggregate([
                        { $match: Object.assign(Object.assign({}, scope), { resolution: bucket.source, time: { $gte: bucket.from, $lt: bucket.to } }) },
                        { $group: { _id: '$metric', total: { $sum: '$total' }, minimum: { $min: '$minimum' }, maximum: { $max: '$maximum' }, samples: { $sum: '$samples' } } }
                    ]).toArray();
                    const version = (previous.retentionVersion || 0) + 1;
                    const prepared = { id: key([args.ownerId, args.seriesId, 'retention', version, bucket.source, bucket.from]), rows: aggregates.map((r) => (Object.assign(Object.assign({}, scope), { metric: r._id, resolution: bucket.target, time: bucket.from, total: r.total, minimum: r.minimum, maximum: r.maximum, samples: r.samples }))), remove: { resolution: bucket.source, from: bucket.from, to: bucket.to }, retention: { [bucket.marker]: bucket.to, retentionVersion: version } };
                    const claimed = yield heads.updateOne({ _id: previous._id, time: previous.time, received_at: previous.received_at, pending: { $exists: false }, retentionVersion: (_m = previous.retentionVersion) !== null && _m !== void 0 ? _m : { $exists: false } }, { $set: { pending: prepared } });
                    if (claimed.matchedCount) {
                        yield drain(Object.assign(Object.assign({}, previous), { pending: prepared }));
                        processed++;
                    }
                }
            const head = yield heads.findOne(scope), remaining = head ? yield next(head, true) : null;
            return { more: !!((head === null || head === void 0 ? void 0 : head.pending) || remaining), oldestDueAt: (_r = (_o = remaining === null || remaining === void 0 ? void 0 : remaining.from) !== null && _o !== void 0 ? _o : (_q = (_p = head === null || head === void 0 ? void 0 : head.pending) === null || _p === void 0 ? void 0 : _p.remove) === null || _q === void 0 ? void 0 : _q.from) !== null && _r !== void 0 ? _r : null, processed };
        }
        let head = yield heads.findOne(scope);
        yield drain(head);
        head = yield heads.findOne(scope);
        if (args.operation === 'latest')
            return head ? { time: head.time, received_at: head.received_at, snapshot: head.time === args.since ? null : head.snapshot ? JSON.parse(head.snapshot) : null } : null;
        if (args.operation === 'history') {
            const { from, to, step } = args;
            if (![from, to, step].every(finite) || from >= to || step < 30000 || (to - from) / step > 1500)
                throw new Error('Unbounded time-series query');
            if (args.excludePrefix !== undefined && args.excludePrefix !== 'service.')
                throw new Error('Invalid metric prefix');
            const metrics = args.metrics;
            if (metrics !== undefined && (!Array.isArray(metrics) || metrics.length > 100 || metrics.some((m) => typeof m !== 'string' || m.length > 1024)))
                throw new Error('Invalid metric selection');
            if ((metrics === null || metrics === void 0 ? void 0 : metrics.length) === 0)
                return [];
            const result = yield rows.aggregate([
                { $match: Object.assign(Object.assign(Object.assign({}, scope), (metrics ? { metric: Object.assign({ $in: metrics }, (args.excludePrefix ? { $not: /^service\./ } : {})) } : args.excludePrefix ? { metric: { $not: /^service\./ } } : {})), { time: Object.assign({ $gte: Math.max(from, (head === null || head === void 0 ? void 0 : head.expiredBefore) || 0), $lt: to }, (head ? { $lte: head.time } : {})), $or: [{ resolution: 0, time: { $gte: (head === null || head === void 0 ? void 0 : head.rawBefore) || 0 } }, { resolution: 300000, time: { $gte: (head === null || head === void 0 ? void 0 : head.fiveBefore) || 0 } }, { resolution: 3600000 }] }) },
                { $group: { _id: { metric: '$metric', time: { $multiply: [{ $floor: { $divide: ['$time', step] } }, step] } }, total: { $sum: '$total' }, minimum: { $min: '$minimum' }, maximum: { $max: '$maximum' }, samples: { $sum: '$samples' }, resolution: { $max: '$resolution' } } },
                { $project: { _id: 0, metric: '$_id.metric', time: '$_id.time', average: { $divide: ['$total', '$samples'] }, minimum: 1, maximum: 1, samples: 1, resolution: 1 } }, { $sort: { time: 1, metric: 1 } }
            ]).toArray();
            const after = yield heads.findOne(scope);
            if ((after === null || after === void 0 ? void 0 : after.pending) || ((after === null || after === void 0 ? void 0 : after.retentionVersion) || 0) !== ((head === null || head === void 0 ? void 0 : head.retentionVersion) || 0) || ((after === null || after === void 0 ? void 0 : after.expiredBefore) || 0) !== ((head === null || head === void 0 ? void 0 : head.expiredBefore) || 0)) {
                if ((args.retry || 0) >= 5)
                    throw new Error('Concurrent retention; retry history');
                return mongoTimeSeriesOperation(client, table, Object.assign(Object.assign({}, args), { retry: (args.retry || 0) + 1 }));
            }
            return result;
        }
        throw new Error('Unknown time-series operation');
    });
}
exports.mongoTimeSeriesOperation = mongoTimeSeriesOperation;
