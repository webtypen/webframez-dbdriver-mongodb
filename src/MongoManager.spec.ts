import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MongoDBDriver} from './MongoDBDriver';
const enabled=!!process.env.WEBFRAMEZ_TEST_MONGODB_URL;
async function fixture(t:any){
 const d=new MongoDBDriver();d.setConfig({url:(process.env.WEBFRAMEZ_TEST_MONGODB_URL||'mongodb://127.0.0.1:27017').replace(/\/$/,'')+'/webframez_driver_test_'+randomUUID().replace(/-/g,''),idStrategy:'preserve'});
 const client=await d.connect();t.after(async()=>{await client.db().dropDatabase();await d.close(client);});return {d,client};
}
test('manager write normalization never removes tenant predicates; UUIDs, zero and buffers remain intact',{skip:!enabled},async t=>{
 const {d,client}=await fixture(t);
 await d.execute(client,{type:'insertOne',table:'docs',documentMode:true,data:{_id:'uuid',tenant:'own',optional:undefined,nested:{optional:undefined},buffer:Buffer.from('data')}});
 const stored=await client.db().collection<any>('docs').findOne({_id:'uuid'});assert.equal(Object.hasOwn(stored,'optional'),false);assert.deepEqual(stored.nested,{});assert.ok(Buffer.isBuffer(stored.buffer));
 assert.equal(await d.execute(client,{type:'modelUpdateReturning',table:'docs',documentMode:true,filter:{_id:'uuid',tenant:undefined},update:{$set:{changed:true}}},{returnDocument:'after'}),null);
 await d.execute(client,{type:'updateOne',table:'docs',documentMode:true,filter:{_id:'uuid'},data:{tenant:undefined}});
 assert.equal(Object.hasOwn((await client.db().collection<any>('docs').findOne({_id:'uuid'}))!,'tenant'),false);
 assert.equal(d.idAdapter.create('012345678901234567890123'),'012345678901234567890123');assert.equal(d.idAdapter.create(0),0);
});
test('standalone telemetry commits once, recovers interrupted history writes and preserves weighted extrema',{skip:!enabled},async t=>{
 const {d,client}=await fixture(t),table='metrics';
 const exec=(operation:string,data:any={})=>d.execute(client,{type:'timeSeries',table,operation,...data});
 await exec('ensure');
 const sample=(time:number,value:number)=>({ownerId:'p',seriesId:'s',timestamp:time,receivedAt:time,values:{cpu:value},snapshot:{time}});
 const results=await Promise.all(Array.from({length:8},()=>exec('append',{sample:sample(30000,0.2)})));assert.equal(results.filter(r=>r.accepted).length,1);
 const database=client.db(),rows=database.collection(table);let fail=true;
 const proxy={db:()=>({collection:(name:string)=>name===table?new Proxy(rows,{get:(target,key)=>key==='bulkWrite'?((...args:any[])=>{if(fail){fail=false;throw new Error('injected interruption');}return (target.bulkWrite as any)(...args);}):typeof (target as any)[key]==='function'?(target as any)[key].bind(target):(target as any)[key]}):database.collection(name)})};
 await assert.rejects(d.execute(proxy,{type:'timeSeries',table,operation:'append',sample:sample(60000,0.8)}),/injected/);
 assert.equal((await exec('latest',{ownerId:'p',seriesId:'s'})).time,60000);
 const history=await exec('history',{ownerId:'p',seriesId:'s',from:0,to:90000,step:90000});assert.equal(history[0].samples,2);assert.equal(history[0].average,0.5);assert.equal(history[0].minimum,0.2);assert.equal(history[0].maximum,0.8);
 assert.deepEqual(await exec('history',{ownerId:'foreign',seriesId:'s',from:0,to:90000,step:90000}),[]);
 await assert.rejects(exec('append',{sample:{...sample(90000,0.5),snapshot:{bad:1n}}}),/BigInt/);assert.equal((await exec('latest',{ownerId:'p',seriesId:'s'})).time,60000);
});

test('standalone retention recovers interrupted bucket commits without double counting',{skip:!enabled},async t=>{
 const {d,client}=await fixture(t),table='retention_metrics';
 const exec=(operation:string,data:any={})=>d.execute(client,{type:'timeSeries',table,operation,...data});
 const day=86400000,now=400*day,scope={ownerId:'p',seriesId:'s'};
 await exec('ensure');
 for(const [time,value] of [[now-366*day,.1],[now-40*day+30000,.2],[now-40*day+60000,.8],[now-3*day+30000,.3],[now-day,.4]])await exec('append',{sample:{...scope,timestamp:time,receivedAt:time,values:{cpu:value},snapshot:{time}}});
 const database=client.db(),rows=database.collection(table);let fail=true;
 const proxy={db:()=>({collection:(name:string)=>name===table?new Proxy(rows,{get:(target,key)=>key==='deleteMany'?((filter:any,...rest:any[])=>{if(fail&&filter.resolution!==undefined){fail=false;throw new Error('retention interruption');}return (target.deleteMany as any)(filter,...rest);}):typeof (target as any)[key]==='function'?(target as any)[key].bind(target):(target as any)[key]}):database.collection(name)})};
 await assert.rejects(d.execute(proxy,{type:'timeSeries',table,operation:'maintain',...scope,now}),/retention interruption/);
 await Promise.all([exec('maintain',{...scope,now}),exec('maintain',{...scope,now})]);
 const read=()=>exec('history',{...scope,from:0,to:now,step:day});
 const history=await read();assert.equal(history.length,3);assert.equal(history[0].samples,2);assert.equal(history[0].average,.5);assert.equal(history[0].minimum,.2);assert.equal(history[0].maximum,.8);assert.equal(history[0].resolution,3600000);assert.equal(history[1].resolution,300000);assert.equal(history[2].resolution,0);
 await exec('maintain',{...scope,now});assert.deepEqual(await read(),history);
 assert.deepEqual(await exec('history',{...scope,from:0,to:now,step:day,metrics:['missing']}),[]);
 assert.equal((await exec('latest',{...scope,since:now-day})).snapshot,null);
 while((await exec('maintain',{...scope,now:now+366*day})).more) {}assert.deepEqual(await read(),[]);assert.equal((await exec('latest',scope)).snapshot,null);
});

test('standalone retention obeys bucket budgets and exposes resumable scoped backlog',{skip:!enabled},async t=>{
 const {d,client}=await fixture(t),table='bounded_metrics',now=400*86400000,start=now-4*86400000,scope={ownerId:'p',seriesId:'s'};
 const exec=(operation:string,data:any={})=>d.execute(client,{type:'timeSeries',table,operation,...data});
 await exec('ensure');
 for(let i=0;i<9;i++)await exec('append',{sample:{...scope,timestamp:start+i*300000,receivedAt:start+i*300000,values:{cpu:i}}});
 const first=await exec('maintain',{...scope,now,options:{maxBuckets:1}});
 assert.equal(first.processed,1);assert.equal(first.more,true);assert.equal(first.oldestDueAt,start+300000);
 let result=first,batches=1;
 while(result.more){result=await exec('maintain',{...scope,now,options:{maxBuckets:1}});assert.ok(++batches<=9);}
 assert.equal((await exec('retentionStatus',{...scope,now})).more,false);
 assert.equal((await exec('capabilities')).version,2);
 const history=await exec('history',{...scope,from:start,to:now,step:86400000});
 assert.equal(history[0].samples,9);assert.equal(history[0].average,4);
});

test('standalone backlog reports the oldest due resolution',{skip:!enabled},async t=>{
 const {d,client}=await fixture(t),table='oldest_metrics',day=86400000,now=400*day,old=now-40*day,scope={ownerId:'p',seriesId:'s'};
 const exec=(operation:string,data:any={})=>d.execute(client,{type:'timeSeries',table,operation,...data});
 const append=(time:number)=>exec('append',{sample:{...scope,timestamp:time,receivedAt:time,values:{cpu:.5}}});
 await exec('ensure');await append(old);
 while((await exec('maintain',{...scope,now:old+3*day})).more){}
 await append(now-3*day);
 assert.equal((await exec('retentionStatus',{...scope,now})).oldestDueAt,old);
});
