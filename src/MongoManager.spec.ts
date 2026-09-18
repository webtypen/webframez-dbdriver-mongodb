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
