import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import transfer from '../desktop/shopee-transfer.cjs';

const {downloadVideo}=transfer;
const first='https://down-vn.vod.susercontent.com/first.mp4';
const second='https://down-vn.vod.susercontent.com/second.mp4';
const referer='https://shopee.vn/product/1006220775/43860967938';
const video=Buffer.alloc(32);video.writeUInt32BE(24);video.write('ftyp',4);video.write('isom',8);
async function fixture(fn){const folder=await mkdtemp(join(tmpdir(),'shopee-transfer-'));const temporary=join(folder,'.video.part');try{await fn(temporary);}finally{await rm(folder,{recursive:true,force:true});}}
function response(bytes=video,headers={}){return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':String(bytes.length),...headers}});}

test('rejects an image and tries another source without a forbidden Referer header',async()=>fixture(async temporary=>{
 const calls=[];let cancelled=false;
 const fetch=async(url,options)=>{calls.push({url,options});return url===first?new Response(new ReadableStream({pull(controller){controller.enqueue(Buffer.alloc(8192));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/webp'}}):response();};
 const result=await downloadVideo({fetch,sources:[first,first,second],temporary,referer});
 assert.deepEqual(result,{source:second,size:video.length});assert.equal(cancelled,true);
 assert.deepEqual(calls.map(call=>call.url),[first,second]);assert.equal(calls[0].options.headers.Referer,undefined);assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.headers.Range,undefined);
 assert.deepEqual(await readFile(temporary),video);
}));

test('checks signature across chunks and stops a mislabeled HTML stream before consuming it all',async()=>fixture(async temporary=>{
 let chunks=0,cancelled=false;
 const fetch=async()=>new Response(new ReadableStream({pull(controller){chunks++;controller.enqueue(Buffer.from('<html>not video!'));},cancel(){cancelled=true;}}),{headers:{'content-type':'video/mp4'}});
 await assert.rejects(downloadVideo({fetch,sources:[first],temporary,referer}),error=>error.sourceFailure===true&&/không phải MP4/.test(error.message));
 assert.ok(chunks<=2);assert.equal(cancelled,true);await assert.rejects(stat(temporary),{code:'ENOENT'});
 const split=new ReadableStream({start(controller){controller.enqueue(video.subarray(0,5));controller.enqueue(video.subarray(5,11));controller.enqueue(video.subarray(11));controller.close();}});
 await downloadVideo({fetch:async()=>new Response(split),sources:[first],temporary,referer});assert.deepEqual(await readFile(temporary),video);
}));

test('tries alternatives before one bounded retry for SSL or temporary HTTP failures',async()=>fixture(async temporary=>{
 const calls=[];let count=0;
 const fetch=async url=>{calls.push(url);if(url===first&&count++===0)throw Error('net::ERR_SSL_PROTOCOL_ERROR');if(url===second)return new Response('down',{status:503});return response();};
 await downloadVideo({fetch,sources:[first,second],temporary,referer});assert.deepEqual(calls,[first,second,first]);assert.deepEqual(await readFile(temporary),video);
}));

test('does not retry certificate failures or ordinary HTTP 403 errors',async()=>fixture(async temporary=>{
 let calls=0;
 await assert.rejects(downloadVideo({fetch:async()=>{calls++;throw Error('net::ERR_CERT_AUTHORITY_INVALID');},sources:[first],temporary,referer}),/ERR_CERT_AUTHORITY_INVALID/);assert.equal(calls,1);
 await assert.rejects(downloadVideo({fetch:async()=>{calls++;return new Response('blocked',{status:403});},sources:[second],temporary,referer}),/HTTP 403/);assert.equal(calls,2);
}));

test('validates redirect destinations before requesting them',async()=>fixture(async temporary=>{
 const calls=[];
 await assert.rejects(downloadVideo({fetch:async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://evil.test/movie.mp4'}});},sources:[first],temporary,referer}),/chuyển hướng không thuộc/);assert.deepEqual(calls,[first]);
 const result=await downloadVideo({fetch:async url=>url===first?new Response(null,{status:302,headers:{location:'/second.mp4'}}):response(),sources:[first],temporary,referer});assert.equal(result.source,second);
}));

test('rejects partial HTTP 206 responses even if they start with an MP4 header',async()=>fixture(async temporary=>{
 const partial=async()=>new Response(video,{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-31/1000'}});
 await assert.rejects(downloadVideo({fetch:partial,sources:[first],temporary,referer}),/một phần video/);await assert.rejects(stat(temporary),{code:'ENOENT'});
 const full=async()=>new Response(video,{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-31/32'}});
 await downloadVideo({fetch:full,sources:[first],temporary,referer});assert.deepEqual(await readFile(temporary),video);
}));

test('removes incomplete files and retries a truncated body',async()=>fixture(async temporary=>{
 let calls=0;
 const fetch=async()=>{calls++;return response(video,{'content-length':calls===1?'1000':'32'});};
 await downloadVideo({fetch,sources:[first],temporary,referer});assert.equal(calls,2);assert.deepEqual(await readFile(temporary),video);
}));

test('does not compare decoded payload size against a compressed Content-Length',async()=>fixture(async temporary=>{
 await downloadVideo({fetch:async()=>response(video,{'content-encoding':'gzip','content-length':'20'}),sources:[first],temporary,referer});assert.deepEqual(await readFile(temporary),video);
}));

test('body timeout aborts and removes a partially written file',async()=>fixture(async temporary=>{
 let cancelled=false;
 const body=new ReadableStream({start(controller){controller.enqueue(video);},cancel(){cancelled=true;}});
 await assert.rejects(downloadVideo({fetch:async()=>new Response(body),sources:[first],temporary,referer,timeout:20,retries:0}),/Hết thời gian/);assert.equal(cancelled,true);await assert.rejects(stat(temporary),{code:'ENOENT'});
}));

test('header idle timeout falls back before the total timeout expires',async()=>fixture(async temporary=>{
 const calls=[];let aborted=false;
 const fetch=async(url,{signal})=>{calls.push(url);if(url===first){signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}return response();};
 await downloadVideo({fetch,sources:[first,second],temporary,referer,idleTimeout:10,timeout:1000});
 assert.equal(aborted,true);assert.deepEqual(calls,[first,second]);assert.deepEqual(await readFile(temporary),video);
}));

test('body idle timeout cancels a stalled stream and retries it once',async()=>fixture(async temporary=>{
 let cancelled=false,calls=0;
 const body=new ReadableStream({start(controller){controller.enqueue(video);},cancel(){cancelled=true;}});
 const fetch=async()=>++calls===1?new Response(body):response();
 await downloadVideo({fetch,sources:[first],temporary,referer,idleTimeout:10,timeout:1000});
 assert.equal(cancelled,true);assert.equal(calls,2);assert.deepEqual(await readFile(temporary),video);
}));

test('flowing data resets the idle timeout and can outlive its initial deadline',async t=>fixture(async temporary=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let stream;
 const body=new ReadableStream({start(controller){stream=controller;}});
 const pending=downloadVideo({fetch:async()=>new Response(body),sources:[first],temporary,referer,idleTimeout:10,timeout:1000,retries:0});
 await new Promise(resolve=>setImmediate(resolve));
 for(const chunk of [video.subarray(0,4),video.subarray(4,8),video.subarray(8,12),video.subarray(12)]){
  t.mock.timers.tick(6);stream.enqueue(chunk);await new Promise(resolve=>setImmediate(resolve));
 }
 stream.close();await pending;assert.deepEqual(await readFile(temporary),video);
}));

test('external cancellation aborts the active source without fallback',async()=>fixture(async temporary=>{
 const controller=new AbortController();let calls=0;
 const body=new ReadableStream({start(stream){stream.enqueue(video);setTimeout(()=>controller.abort(),20);}});
 await assert.rejects(downloadVideo({fetch:async()=>{calls++;return new Response(body);},sources:[first,second],temporary,referer,signal:controller.signal}),error=>error.cancelled===true);assert.equal(calls,1);await assert.rejects(stat(temporary),{code:'ENOENT'});
}));

test('cancels a late response when fetch ignores abort and does not wait on stalled stream cancellation',async()=>fixture(async temporary=>{
 let complete,cancelled=false;
 const body=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
 await assert.rejects(downloadVideo({fetch:()=>new Promise(resolve=>{complete=resolve;}),sources:[first],temporary,referer,timeout:10,retries:0}),/Hết thời gian/);
 complete(new Response(body));await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
 await assert.rejects(stat(temporary),{code:'ENOENT'});
}));

test('refuses playlists and oversized data, preserving a preexisting temporary file',async()=>fixture(async temporary=>{
 let calls=0;
 await assert.rejects(downloadVideo({fetch:async()=>{calls++;return response();},sources:['https://down-vn.vod.susercontent.com/master.m3u8'],temporary,referer}),/Chưa tìm thấy/);assert.equal(calls,0);
 await assert.rejects(downloadVideo({fetch:async()=>response(),sources:[first],temporary,referer,maxBytes:16}),/giới hạn dung lượng/);await assert.rejects(stat(temporary),{code:'ENOENT'});
 await writeFile(temporary,'existing');
 await assert.rejects(downloadVideo({fetch:async()=>response(),sources:[first,second],temporary,referer}),error=>error.code==='EEXIST'&&!error.sourceFailure);assert.equal(await readFile(temporary,'utf8'),'existing');
}));
