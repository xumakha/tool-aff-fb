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
 const response=id=>debug.emit('message',{},'Network.responseReceived',{requestId:id,response:{url:'https://shopee.vn/api/v4/pdp/get_pc',status:200}});
 response('old');debug.emit('message',{},'Network.loadingFinished',{requestId:'old'});
 capture.reset('12:35');complete({body:JSON.stringify(payload)});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(capture.urls(),[]);
 capture.reset('12:34');response('new');debug.emit('message',{},'Network.loadingFinished',{requestId:'new'});
 complete({body:Buffer.from(JSON.stringify(payload)).toString('base64'),base64Encoded:true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(capture.urls(),[url]);
 capture.dispose();assert.equal(debug.listenerCount('message'),0);assert.equal(attached,false);
});
