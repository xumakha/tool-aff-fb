import {test} from 'node:test';
import assert from 'node:assert/strict';
import resolver from '../desktop/shopee-resolve.cjs';
const {resolveProductVideo}=resolver;
const first='https://down-vn.vod.susercontent.com/metadata-resource';
const second='https://down-vn.vod.susercontent.com/playback.mp4';

test('reports explicit API errors immediately but still accepts an available playback source',async()=>{
 const options={probe:async()=>({urls:[]}),checkStock:async()=>false,readDiagnostics:()=>({read:true,apiError:266900002}),pause:async()=>{throw Error('unnecessary wait');},download:async()=>{}};
 assert.equal((await resolveProductVideo(options)).apiError,266900002);
 assert.equal((await resolveProductVideo({...options,readSources:()=>[first]})).downloaded,true);
});

test('downloads immediately when metadata already contains a source',async()=>{
 const calls=[];
 const result=await resolveProductVideo({probe:async()=>({title:'Product',urls:[]}),checkStock:async()=>false,readSources:()=>[first],pause:async()=>{throw Error('Unexpected delay');},download:async sources=>calls.push(sources)});
 assert.equal(result.downloaded,true);assert.deepEqual(calls,[[first]]);
});

test('keeps probing after bad metadata and downloads a later playback source once',async()=>{
 const calls=[];let probes=0,waits=0;
 const result=await resolveProductVideo({probe:async()=>({title:'Product',activated:++probes===1,urls:probes<3?[first]:[first,second]}),checkStock:async()=>false,pause:async()=>waits++,download:async sources=>{calls.push(sources);if(sources.includes(first))throw Object.assign(Error('image/webp'),{sourceFailure:true});}});
 assert.equal(result.downloaded,true);assert.equal(result.activated,true);assert.equal(waits,2);assert.deepEqual(calls,[[first],[second]]);
});

test('bounds discovery and reports exhausted source failures without redownloading them',async()=>{
 let calls=0;
 await assert.rejects(resolveProductVideo({probe:async()=>({urls:[first]}),checkStock:async()=>false,pause:async()=>{},attempts:3,download:async()=>{calls++;throw Object.assign(Error('HTTP 403'),{sourceFailure:true});}}),/Đã thử 1 nguồn video.*HTTP 403/);
 assert.equal(calls,1);
 const noSource=await resolveProductVideo({probe:async()=>({urls:[]}),checkStock:async()=>false,pause:async()=>{},attempts:3,download:async()=>{throw Error('unexpected download');}});
 assert.equal(noSource.downloaded,false);
});

test('stock, cancellation and local disk failures stop discovery',async()=>{
 const options={probe:async()=>({urls:[first]}),checkStock:async()=>false,pause:async()=>{throw Error('unexpected wait');}};
 assert.deepEqual(await resolveProductVideo({...options,checkStock:async()=>true,download:async()=>{throw Error('unexpected download');}}),{soldOut:true});
 for(const properties of [{code:'ENOSPC'},{cancelled:true}]){
  const error=Object.assign(Error('stop'),properties);
  await assert.rejects(resolveProductVideo({...options,download:async()=>{throw error;}}),value=>value===error);
 }
});
