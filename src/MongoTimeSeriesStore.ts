import {createHash} from 'node:crypto';
import type {MongoClient} from 'mongodb';
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const key=(values:any[])=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
/** A bounded pending batch in the atomic head is the commit record. Replay is idempotent,
 * so standalone MongoDB installations need neither multi-document transactions nor a replica set. */
export async function mongoTimeSeriesOperation(client:MongoClient,table:string,args:any):Promise<any>{
 if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table))throw new Error('Invalid time-series table');
 const rows=client.db().collection<any>(table),heads=client.db().collection<any>(table+'_latest');
 const drain=async(head:any)=>{
  if(!head?.pending)return;
  const pending=head.pending;
  if(pending.rows.length) await rows.bulkWrite(pending.rows.map((row:any)=>({updateOne:{filter:{owner_id:row.owner_id,series_id:row.series_id,metric:row.metric,resolution:row.resolution,time:row.time},update:{$setOnInsert:row},upsert:true}})),{ordered:true});
  if(pending.remove) await rows.deleteMany({owner_id:head.owner_id,series_id:head.series_id,resolution:pending.remove.resolution,time:{$gte:pending.remove.from,$lt:pending.remove.to}});
  await heads.updateOne({_id:head._id,'pending.id':pending.id},{$unset:{pending:''},...(pending.retention?{$set:pending.retention}:{} )});
 };
 if(args.operation==='ensure'){
  await rows.createIndex({owner_id:1,series_id:1,metric:1,resolution:1,time:1},{unique:true});
  await rows.createIndex({owner_id:1,series_id:1,time:1});
  await heads.createIndex({owner_id:1,series_id:1},{unique:true});return;
 }
 if(args.operation==='flush'){
  for await(const head of heads.find({pending:{$exists:true}}))await drain(head);return;
 }
 if(args.operation==='append'){
  const s=args.sample,entries=Object.entries(s?.values||{});
  if(!s?.ownerId||!s.seriesId||!finite(s.timestamp)||!finite(s.receivedAt)||!entries.length||entries.length>1024||entries.some(([k,v])=>k.length>1024||!finite(v)))throw new Error('Invalid time-series sample');
  // Serialization must succeed before publishing the commit record.
  const snapshot=JSON.stringify(s.snapshot??null),id=key([s.ownerId,s.seriesId]);
  for(let attempt=0;attempt<100;attempt++){
   const previous=await heads.findOne({owner_id:s.ownerId,series_id:s.seriesId});
   if(previous?.pending){await drain(previous);continue;}
   if(previous&&(s.timestamp<Math.max(previous.rawBefore||0,previous.expiredBefore||0)||s.timestamp<=previous.time||s.receivedAt-previous.received_at<10000))return {accepted:false};
   const pending={id:key([s.ownerId,s.seriesId,s.timestamp]),rows:entries.map(([metric,value])=>({owner_id:s.ownerId,series_id:s.seriesId,metric,resolution:0,time:s.timestamp,total:value,minimum:value,maximum:value,samples:1}))};
   const next={owner_id:s.ownerId,series_id:s.seriesId,time:s.timestamp,received_at:s.receivedAt,snapshot,pending};
   if(previous){
    const result=await heads.updateOne({_id:previous._id,time:previous.time,received_at:previous.received_at,pending:{$exists:false},retentionVersion:previous.retentionVersion??{$exists:false},expiredBefore:previous.expiredBefore??{$exists:false}},{$set:next});
    if(!result.matchedCount)continue;
   }else{
    try{await heads.insertOne({_id:id,...next});}catch(error:any){if(error.code===11000)continue;throw error;}
   }
   await drain({_id:previous?._id||id,...next});return {accepted:true};
  }
  throw new Error('Concurrent telemetry update could not settle; retry the sample.');
 }
 if(args.operation==='capabilities')return {version:2,features:['retention.bounded.v1','history.metrics.v1','latest.since.v1'],maxMetrics:1024};
 if(args.operation==='series') {
  const limit=args.limit??100;if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid series page size');
  const filter=args.after?{$or:[{owner_id:{$gt:args.after.ownerId}},{owner_id:args.after.ownerId,series_id:{$gt:args.after.seriesId}}]}:{};
  return heads.find(filter,{projection:{_id:0,owner_id:1,series_id:1}}).sort({owner_id:1,series_id:1}).limit(limit).toArray();
 }
 const scope={owner_id:args.ownerId,series_id:args.seriesId};
 if(args.operation==='maintain'||args.operation==='retentionStatus') {
  if(!args.ownerId||!args.seriesId||!finite(args.now)||args.now<0)throw new Error('Invalid retention scope');
  const maxBuckets=args.options?.maxBuckets??4,maxDurationMs=args.options?.maxDurationMs??100;
  if(!Number.isInteger(maxBuckets)||maxBuckets<1||maxBuckets>32||!finite(maxDurationMs)||maxDurationMs<1||maxDurationMs>1000)throw new Error('Invalid retention budget');
  const expiry=Math.floor((args.now-365*86400000)/3600000)*3600000;
  const stages=[[0,300000,48*3600000,'rawBefore'],[300000,3600000,30*86400000,'fiveBefore']] as const;
  const obsolete=(head:any)=>({$or:[{time:{$lt:expiry}},{resolution:0,time:{$lt:head.rawBefore||0}},{resolution:300000,time:{$lt:head.fiveBefore||0}}]});
  const next=async(head:any,oldest=false)=>{
   const removed=await rows.findOne({...scope,...obsolete(head)},{sort:{time:1}});
   if(removed)return {expired:true,from:Math.floor(removed.time/300000)*300000,to:(Math.floor(removed.time/300000)+1)*300000};
   let selected:any=null;
   for(const [source,target,age,marker] of stages){
    const cutoff=Math.floor((args.now-age)/target)*target;
    const first=await rows.findOne({...scope,resolution:source,time:{$gte:Math.max(head[marker]||0,expiry),$lt:cutoff}},{sort:{time:1}});
    if(first){
     const bucket={expired:false,source,target,marker,from:Math.floor(first.time/target)*target,to:(Math.floor(first.time/target)+1)*target};
     if(!oldest)return bucket;
     if(!selected||bucket.from<selected.from)selected=bucket;
    }
   }
   return selected;
  };
  const started=performance.now();let processed=0;
  if(args.operation==='maintain')for(let batch=0;batch<maxBuckets&&(batch===0||performance.now()-started<maxDurationMs);batch++){
   const previous=await heads.findOne(scope);if(!previous)return {more:false,oldestDueAt:null,processed};
   if(previous.pending){await drain(previous);processed++;continue;}
   await heads.updateOne(scope,{$max:{expiredBefore:expiry}});
   if(previous.time<expiry)await heads.updateOne({...scope,time:previous.time},{$set:{snapshot:null}});
   const bucket=await next(previous);if(!bucket)break;
   if(bucket.expired){
    await rows.deleteMany({...scope,$and:[obsolete(previous),{time:{$gte:bucket.from,$lt:bucket.to}}]});processed++;continue;
   }
   const aggregates=await rows.aggregate([
    {$match:{...scope,resolution:bucket.source,time:{$gte:bucket.from,$lt:bucket.to}}},
    {$group:{_id:'$metric',total:{$sum:'$total'},minimum:{$min:'$minimum'},maximum:{$max:'$maximum'},samples:{$sum:'$samples'}}}
   ]).toArray();
   const version=(previous.retentionVersion||0)+1;
   const prepared={id:key([args.ownerId,args.seriesId,'retention',version,bucket.source,bucket.from]),rows:aggregates.map((r:any)=>({...scope,metric:r._id,resolution:bucket.target,time:bucket.from,total:r.total,minimum:r.minimum,maximum:r.maximum,samples:r.samples})),remove:{resolution:bucket.source,from:bucket.from,to:bucket.to},retention:{[bucket.marker!]:bucket.to,retentionVersion:version}};
   const claimed=await heads.updateOne({_id:previous._id,time:previous.time,received_at:previous.received_at,pending:{$exists:false},retentionVersion:previous.retentionVersion??{$exists:false}},{$set:{pending:prepared}});
   if(claimed.matchedCount){await drain({...previous,pending:prepared});processed++;}
  }
  const head=await heads.findOne(scope),remaining=head?await next(head,true):null;
  return {more:!!(head?.pending||remaining),oldestDueAt:remaining?.from??head?.pending?.remove?.from??null,processed};
 }
 let head=await heads.findOne(scope);await drain(head);head=await heads.findOne(scope);
 if(args.operation==='latest')return head?{time:head.time,received_at:head.received_at,snapshot:head.time===args.since?null:head.snapshot?JSON.parse(head.snapshot):null}:null;
 if(args.operation==='history'){
  const {from,to,step}=args;
  if(![from,to,step].every(finite)||from>=to||step<30000||(to-from)/step>1500)throw new Error('Unbounded time-series query');
  if(args.excludePrefix!==undefined && args.excludePrefix!=='service.')throw new Error('Invalid metric prefix');
  const metrics=args.metrics;
  if(metrics!==undefined&&(!Array.isArray(metrics)||metrics.length>100||metrics.some((m:any)=>typeof m!=='string'||m.length>1024)))throw new Error('Invalid metric selection');
  if(metrics?.length===0)return [];
  const result=await rows.aggregate([
   {$match:{...scope,...(metrics?{metric:{$in:metrics,...(args.excludePrefix?{$not:/^service\./}:{})}}:args.excludePrefix?{metric:{$not:/^service\./}}:{}),time:{$gte:Math.max(from,head?.expiredBefore||0),$lt:to,...(head?{$lte:head.time}:{})},$or:[{resolution:0,time:{$gte:head?.rawBefore||0}},{resolution:300000,time:{$gte:head?.fiveBefore||0}},{resolution:3600000}]}},
   {$group:{_id:{metric:'$metric',time:{$multiply:[{$floor:{$divide:['$time',step]}},step]}},total:{$sum:'$total'},minimum:{$min:'$minimum'},maximum:{$max:'$maximum'},samples:{$sum:'$samples'},resolution:{$max:'$resolution'}}},
   {$project:{_id:0,metric:'$_id.metric',time:'$_id.time',average:{$divide:['$total','$samples']},minimum:1,maximum:1,samples:1,resolution:1}},{$sort:{time:1,metric:1}}
  ]).toArray();
  const after=await heads.findOne(scope);
  if(after?.pending || (after?.retentionVersion||0)!==(head?.retentionVersion||0) || (after?.expiredBefore||0)!==(head?.expiredBefore||0)) {
   if((args.retry||0)>=5)throw new Error('Concurrent retention; retry history');
   return mongoTimeSeriesOperation(client,table,{...args,retry:(args.retry||0)+1});
  }
  return result;
 }
 throw new Error('Unknown time-series operation');
}
