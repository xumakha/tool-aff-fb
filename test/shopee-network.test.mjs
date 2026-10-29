import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import network from '../desktop/shopee-network.cjs';
const url='https://down-vn.vod.susercontent.com/api/v4/video/resource';
test('uses verified request identity for video metadata with no repeated item IDs',()=>{
 const payload={data:{item:{media:{video_info_list:[{url}]}}},recommendations:[{video:{url:'https://susercontent.com/wrong.mp4'}}]};
 assert.deepEqual(network.productVideos(payload,'12:34'),[]);
 assert.deepEqual(network.productVideos(payload,'12:34',true),[url]);
});
test('closing a destroyed renderer does not throw from cleanup, including repeat cleanup',async()=>{
 const debug=new EventEmitter();debug.attach=()=>{};debug.sendCommand=async()=>({});
 debug.isAttached=()=>{throw Error('Object has been destroyed');};
 const capture=await network.createMediaCapture({debugger:debug});
 assert.doesNotThrow(()=>capture.dispose());assert.doesNotThrow(()=>capture.dispose());assert.equal(debug.listenerCount('message'),0);
});
test('stalled network initialization times out and removes debugger listeners',async()=>{
 const debug=new EventEmitter();let attached=false;
 debug.attach=()=>{attached=true;};debug.detach=()=>{attached=false;};debug.isAttached=()=>attached;
 debug.sendCommand=()=>new Promise(()=>{});
 await assert.rejects(network.createMediaCapture({debugger:debug},{timeout:10}),/Hết thời gian/);
 assert.equal(attached,false);assert.equal(debug.listenerCount('message'),0);
});
const payload={data:{item:{shopid:12,itemid:34,video_info_list:[{default_format:{url},thumbnail:'https://susercontent.com/image'}]},recommendations:[{shopid:12,itemid:35,video_info_list:[{url:'https://susercontent.com/wrong.mp4'}]}]}};
test('extracts extensionless video metadata for exact product, excluding covers and recommendations',()=>{
 assert.deepEqual(network.productVideos(payload,'12:34'),[url]);
 assert.deepEqual(network.productVideos(payload,'99:34'),[]);
});
test('reads nested product media and snake-case IDs without taking related product videos',()=>{
 const data={data:{item:{item_id:34,shop_id:12,media:{video:{url}},related:[{video:{url:'https://susercontent.com/wrong.mp4'}}],other:{item_id:99,video:{url:'https://susercontent.com/other.mp4'}}}}};
 assert.deepEqual(network.productVideos(data,'12:34'),[url]);
 assert.deepEqual(network.productVideos(data,'12:99'),[]);
});
test('captures finished product responses and discards late responses after navigation',async()=>{
 const debug=new EventEmitter();let complete,attached=false;
 debug.attach=()=>{attached=true;};debug.detach=()=>{attached=false;};debug.isAttached=()=>attached;
 debug.sendCommand=async method=>method==='Network.getResponseBody'?await new Promise(resolve=>{complete=resolve;}):{};
 const capture=await network.createMediaCapture({debugger:debug});capture.reset('12:34');
 const response=id=>{const endpoint='https://shopee.vn/api/v4/pdp/get_pc';debug.emit('message',{},'Network.requestWillBeSent',{requestId:id,request:{url:endpoint},documentURL:'https://shopee.vn/product/12/34'});debug.emit('message',{},'Network.responseReceived',{requestId:id,response:{url:endpoint,status:200}});};
 response('old');debug.emit('message',{},'Network.loadingFinished',{requestId:'old'});
 capture.reset('12:35');complete({body:JSON.stringify(payload)});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(capture.urls(),[]);
 capture.reset('12:34');response('new');debug.emit('message',{},'Network.loadingFinished',{requestId:'new'});
 complete({body:Buffer.from(JSON.stringify(payload)).toString('base64'),base64Encoded:true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(capture.urls(),[url]);
 capture.dispose();assert.equal(debug.listenerCount('message'),0);assert.equal(attached,false);
});

test('decodes MMS JSON and prefers actual encodings without treating thumbnails as videos',()=>{
 const actual='https://down-vn.vod.susercontent.com/api/v4/1/mms/product.mp4?token=unchanged%2Fvalue';
 const fallback='https://mms.vod.susercontent.com/api/v4/1/mms/product.default.mp4';
 const data={data:{item:{shopid:12,itemid:34,video_info_list:[{
  thumb_url:'https://susercontent.com/thumbnail-resource',poster:'https://susercontent.com/poster',snapshot_url:'https://susercontent.com/snapshot',
  video_description:'https://shopee.vn/product/12/99',mms_data:JSON.stringify({cover:'https://susercontent.com/cover',default_format:{url:fallback,profile:'MP4'},formats:[{profile:'MP4',url:actual}]})
 }]}}};
 assert.deepEqual(network.productVideos(data,'12:34'),[actual,fallback]);
 data.data.item.video_info_list[0].mms_data='{broken';
 data.data.item.video_info_list[0].formats=[{url:actual}];
 assert.deepEqual(network.productVideos(data,'12:34'),[actual]);
});

test('resolves schema paths only against an explicit metadata URL and skips HLS formats',()=>{
 const fallback='https://mms.vod.susercontent.com/api/v4/1/mms/product.default.mp4';
 const video={default_format:{url:fallback},formats:[{url:'api/v4/1/mms/product.mp4'},{profile:'HLS',url:'https://mms.vod.susercontent.com/opaque-playlist'}],video_id:'unqualified-video-id'};
 assert.deepEqual(network.productVideos({video_info_list:[video]},'12:34',true),['https://mms.vod.susercontent.com/api/v4/1/mms/product.mp4',fallback]);
 assert.deepEqual(network.productVideos({video_info_list:[{video_id:'api/v4/1/mms/product.mp4'}]},'12:34',true),['https://mms.vod.susercontent.com/api/v4/1/mms/product.mp4']);
});

test('resolves ID-only product_images video using the same MMS and legacy routes as Shopee',()=>{
 const id='0123456789abcdef0123456789abcdef';
 const relative='api/v4/11110105/mms/vn-11110105-test.1600000000000.mp4';
 const data=video_id=>({data:{item:{itemid:34,shopid:12},product_images:{video:{video_id,vid:'not-the-download-id',formats:null,default_format:null,mms_data:null},gallery_contents:[{video:{video_id}}]},recommendations:[{video:{video_id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}]}});
 assert.deepEqual(network.productVideos(data(id),'12:34',true),['https://cvf.shopee.vn/file/'+id]);
 assert.deepEqual(network.productVideos(data(relative),'12:34',true),['https://mms.vod.susercontent.com/'+relative]);
 assert.deepEqual(network.productVideos(data(relative),'12:35'),[]);
 assert.deepEqual(network.productVideos({data:{product_images:{video:null}}},'12:34',true),[]);
 for(const value of ['../secret','api/v4/../secret.mp4','api/v4/%2e%2e/secret.mp4','//evil.test/v.mp4','arbitrary-id',id+'?token=x'])assert.equal(network.videoInfoURL(value),null);
});

test('keeps declared encodings ahead of ID fallback without deriving URLs from thumbs or vid',()=>{
 const id='0123456789abcdef0123456789abcdef';
 assert.deepEqual(network.productVideos({video:{video_id:id,formats:[{url}],thumb_url:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}},'12:34',true),[url,'https://cvf.shopee.vn/file/'+id]);
 assert.deepEqual(network.productVideos({video:{vid:id,thumb_url:id,poster:id}},'12:34',true),[]);
});

async function captureFixture(){
 const debug=new EventEmitter();let attached=false;const bodies=new Map();
 debug.attach=()=>{attached=true;};debug.detach=()=>{attached=false;};debug.isAttached=()=>attached;
 debug.sendCommand=async(method,params)=>method==='Network.getResponseBody'?{body:JSON.stringify(bodies.get(params.requestId))}:{};
 const capture=await network.createMediaCapture({debugger:debug});capture.reset('12:34');
 const emit=(method,params)=>debug.emit('message',{},'Network.'+method,params);
 const start=(id,target,options={})=>emit('requestWillBeSent',{requestId:id,documentURL:options.documentURL||'https://shopee.vn/product/12/34',request:{url:target,postData:options.postData}});
 const respond=(id,target,mimeType='application/json',status=200)=>emit('responseReceived',{requestId:id,response:{url:target,mimeType,status}});
 const finish=async(id,payload)=>{bodies.set(id,payload);emit('loadingFinished',{requestId:id});await new Promise(resolve=>setImmediate(resolve));};
 return {capture,start,respond,finish};
}

test('reads POST product identity without accepting a different product response',async()=>{
 const {capture,start,respond,finish}=await captureFixture();
 try{
  const endpoint='https://shopee.vn/api/v4/pdp/get_pc';
  start('post',endpoint,{postData:JSON.stringify({item_id:34,shop_id:12})});respond('post',endpoint);await finish('post',{data:{item:{video_info_list:[{url}]}}});
  assert.deepEqual(capture.urls(),[url]);
  capture.reset('12:34');start('wrong',endpoint,{postData:JSON.stringify({item_id:35,shop_id:12})});respond('wrong',endpoint);await finish('wrong',{data:{video_info_list:[{url}]}});
  assert.deepEqual(capture.urls(),[]);assert.deepEqual(capture.diagnostics(),{});
  start('unscoped',endpoint);respond('unscoped',endpoint);await finish('unscoped',{data:{item:{shopid:12,itemid:35,video_info_list:[{url}]}}});
  assert.deepEqual(capture.urls(),[]);
 }finally{capture.dispose();}
});

test('captures MP4 MIME responses from the active product page behind item-scoped metadata',async()=>{
 const {capture,start,respond,finish}=await captureFixture();
 try{
  const endpoint='https://shopee.vn/api/v4/pdp/get_pc?item_id=34&shop_id=12';
  start('metadata',endpoint);respond('metadata',endpoint);await finish('metadata',{data:{video_info_list:[{url}]}});
  const played='https://down-vn.vod.susercontent.com/actual-playback';
  start('player',played);respond('player',played,'video/mp4',206);
  for(const [id,mime,status,documentURL] of [['image','image/jpeg',200],['manifest','application/vnd.apple.mpegurl',200],['error','video/mp4',403],['foreign','video/mp4',200,'https://shopee.vn/product/12/35']]){
   const target='https://down-vn.vod.susercontent.com/'+id;start(id,target,{documentURL});respond(id,target,mime,status);
  }
  assert.deepEqual(capture.urls(),[url,played]);assert.equal(capture.diagnostics().networkSources,1);
 }finally{capture.dispose();}
});

test('reset discards requests whose response headers arrive after navigation',async()=>{
 const {capture,start,respond,finish}=await captureFixture();
 try{
  const endpoint='https://shopee.vn/api/v4/pdp/get_pc';
  start('old-api',endpoint);start('old-video',url);capture.reset('12:35');
  respond('old-api',endpoint);respond('old-video',url,'video/mp4');await finish('old-api',payload);
  assert.deepEqual(capture.urls(),[]);assert.deepEqual(capture.diagnostics(),{});
 }finally{capture.dispose();}
});
