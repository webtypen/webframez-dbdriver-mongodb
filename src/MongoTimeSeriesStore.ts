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
  await rows.bulkWrite(pending.rows.map((row:any)=>({updateOne:{filter:{owner_id:row.owner_id,series_id:row.series_id,metric:row.metric,resolution:row.resolution,time:row.time},update:{$setOnInsert:row},upsert:true}})),{ordered:true});
  await heads.updateOne({_id:head._id,'pending.id':pending.id},{$unset:{pending:''}});
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
  if(!s?.ownerId||!s.seriesId||!finite(s.timestamp)||!finite(s.receivedAt)||!entries.length||entries.length>256||entries.some(([k,v])=>k.length>256||!finite(v)))throw new Error('Invalid time-series sample');
  // Serialization must succeed before publishing the commit record.
  const snapshot=JSON.stringify(s.snapshot??null),id=key([s.ownerId,s.seriesId]);
  for(let attempt=0;attempt<100;attempt++){
   const previous=await heads.findOne({owner_id:s.ownerId,series_id:s.seriesId});
   if(previous?.pending){await drain(previous);continue;}
   if(previous&&(s.timestamp<=previous.time||s.receivedAt-previous.received_at<10000))return {accepted:false};
   const pending={id:key([s.ownerId,s.seriesId,s.timestamp]),rows:entries.map(([metric,value])=>({owner_id:s.ownerId,series_id:s.seriesId,metric,resolution:0,time:s.timestamp,total:value,minimum:value,maximum:value,samples:1}))};
   const next={owner_id:s.ownerId,series_id:s.seriesId,time:s.timestamp,received_at:s.receivedAt,snapshot,pending};
   if(previous){
    const result=await heads.updateOne({_id:previous._id,time:previous.time,received_at:previous.received_at,pending:{$exists:false}},{$set:next});
    if(!result.matchedCount)continue;
   }else{
    try{await heads.insertOne({_id:id,...next});}catch(error:any){if(error.code===11000)continue;throw error;}
   }
   await drain({_id:previous?._id||id,...next});return {accepted:true};
  }
  throw new Error('Concurrent telemetry update could not settle; retry the sample.');
 }
 const scope={owner_id:args.ownerId,series_id:args.seriesId};
 const head=await heads.findOne(scope);await drain(head);
 if(args.operation==='latest')return head?{time:head.time,received_at:head.received_at,snapshot:head.snapshot?JSON.parse(head.snapshot):null}:null;
 if(args.operation==='history'){
  const {from,to,step}=args;
  if(![from,to,step].every(finite)||from>=to||step<30000||(to-from)/step>1500)throw new Error('Unbounded time-series query');
  return rows.aggregate([
   {$match:{...scope,time:{$gte:from,$lt:to,...(head?{$lte:head.time}:{})}}},
   {$group:{_id:{metric:'$metric',time:{$multiply:[{$floor:{$divide:['$time',step]}},step]}},total:{$sum:'$total'},minimum:{$min:'$minimum'},maximum:{$max:'$maximum'},samples:{$sum:'$samples'},resolution:{$max:'$resolution'}}},
   {$project:{_id:0,metric:'$_id.metric',time:'$_id.time',average:{$divide:['$total','$samples']},minimum:1,maximum:1,samples:1,resolution:1}},{$sort:{time:1,metric:1}}
  ]).toArray();
 }
 throw new Error('Unknown time-series operation');
}
