import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Meta} from '../meta.mjs';
test('comment read permission errors expose only the required permission and safe reconnect guidance',async()=>{
 const meta=new Meta({version:'v99.0',fetcher:async()=>({ok:false,status:400,json:async()=>({error:{code:10,message:"This endpoint requires pages_read_user_content; private-token https://example.com/?secret=private-token"}})})});
 await assert.rejects(meta.request('1_10/comments','private-token'),error=>{
  assert.deepEqual(error.requiredPermissions,['pages_read_user_content']);assert.match(error.message,/kết nối lại/);assert.ok(!error.message.includes('private-token'));assert.ok(!error.message.includes('example.com'));return true;
 });
});
test('server errors on comment POST remain uncertain, while explicit 4xx Graph errors are rejected',async()=>{
 for(const [status,rejected] of [[502,false],[400,true]]){
  const meta=new Meta({version:'v99.0',fetcher:async()=>({ok:false,status,json:async()=>({error:{code:200}})})});
  await assert.rejects(meta.request('1_10/comments','token',{message:'Test'}),error=>error.metaRejected===rejected);
 }
});
test('upload sends exact HTTP content length and preserves only safe error codes',async()=>{
 const meta=new Meta({version:'v99.0',fetcher:async(url,options)=>{
  assert.equal(options.headers['Content-Length'],'5');
  return {ok:false,status:400,json:async()=>({error:{code:190,error_subcode:463,message:'private-token',error_user_msg:'private-token'}})};
 }});
 await assert.rejects(()=>meta.upload('https://rupload.facebook.com/upload','private-token',Buffer.from('video')),error=>error.message.includes('HTTP 400') && error.message.includes('190') && error.message.includes('463') && !error.message.includes('private-token'));
});
test('non JSON upload failures keep HTTP status without exposing response',async()=>{
 const meta=new Meta({version:'v99.0',fetcher:async()=>({ok:false,status:502,json:async()=>{throw Error('secret proxy response');}})});
 await assert.rejects(()=>meta.upload('https://rupload.facebook.com/upload','token',Buffer.from('video')),error=>error.message.includes('502') && !error.message.includes('secret'));
});
test('scheduled Reel sends Meta schedule state and Unix timestamp',async()=>{
 let params;
 const meta=new Meta({version:'v99.0',fetcher:async(url,options)=>{params=options.body;return {ok:true,json:async()=>({success:true})};}});
 await meta.schedule('page','token','123','Caption','2099-01-01T01:00:00.000Z');
 assert.equal(params.get('upload_phase'),'finish');
 assert.equal(params.get('video_state'),'SCHEDULED');
 assert.equal(params.get('scheduled_publish_time'),String(Date.parse('2099-01-01T01:00:00.000Z')/1000));
 assert.equal(params.get('description'),'Caption');
});
test('stream upload reports byte progress without exposing token',async()=>{
 const {Readable}=await import('node:stream');const seen=[];
 const meta=new Meta({version:'v99.0',fetcher:async(url,options)=>{let total=0;for await(const chunk of options.body)total+=chunk.length;assert.equal(total,5);return {ok:true,json:async()=>({success:true})};}});
 await meta.upload('https://rupload.facebook.com/upload','token',Readable.from([Buffer.from('ab'),Buffer.from('cde')]),5,(sent,size)=>seen.push([sent,size]));
 assert.deepEqual(seen,[[2,5],[5,5]]);
});
test('Reels upload uses start, binary transfer and finish with caption',async()=>{const calls=[];const replies=[{video_id:'123',upload_url:'https://rupload.facebook.com/video-upload/123'},{success:true},{success:true}];const meta=new Meta({version:'v99.0',fetcher:async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>replies.shift()};}});const session=await meta.begin('page','secret');await meta.upload(session.upload_url,'secret',Buffer.from('video'));await meta.finish('page','secret',session.video_id,'Xin chào');assert.equal(calls.length,3);assert.equal(calls[0].options.body.get('upload_phase'),'start');assert.equal(calls[1].options.headers.file_size,'5');assert.equal(calls[2].options.body.get('description'),'Xin chào');assert.equal(calls[2].options.body.get('video_state'),'PUBLISHED');assert.ok(calls.every(c=>!c.url.includes('secret')));});
test('rejects untrusted upload host without sending token',async()=>{const meta=new Meta({version:'v99.0',fetcher:()=>{throw Error('must not fetch');}});await assert.rejects(()=>meta.upload('https://example.com','secret',Buffer.from('x')),/không hợp lệ/);});
test('Meta errors do not expose remote response or token',async()=>{const meta=new Meta({version:'v99.0',fetcher:async()=>({ok:false,status:400,json:async()=>({error:{code:190,message:'secret'}})})});await assert.rejects(()=>meta.begin('page','secret'),e=>e.message.includes('190')&&!e.message.includes('secret'));});
test('loads all managed Pages with pagination',async()=>{let count=0;const meta=new Meta({version:'v99.0',fetcher:async()=>({ok:true,json:async()=>++count===1?{data:[{id:'1'}],paging:{next:'yes',cursors:{after:'abc'}}}:{data:[{id:'2'}]}})});assert.deepEqual((await meta.pages('token')).map(p=>p.id),['1','2']);});
test('streams video with explicit file size instead of buffering file',async()=>{const {Readable}=await import('node:stream');let options;const meta=new Meta({version:'v99.0',fetcher:async(url,opts)=>{options=opts;let size=0;for await(const chunk of opts.body)size+=chunk.length;assert.equal(size,5);return {ok:true,json:async()=>({success:true})};}});await meta.upload('https://rupload.facebook.com/upload','token',Readable.from([Buffer.from('video')]),5);assert.equal(options.duplex,'half');assert.equal(options.headers.file_size,'5');});
