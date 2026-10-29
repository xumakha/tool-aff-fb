import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import media from '../desktop/shopee-media.cjs';
function page({label='',excluded=false,hidden=false,resources=[]}={}){
 let videos=[],clicks=0,plays=0;const events=[];
 const control={dataset:{},disabled:false,innerText:label,getAttribute:()=>null,scrollIntoView:()=>{},dispatchEvent:event=>events.push(event.type),click:()=>{clicks++;videos=[{currentSrc:'https://down-vn.vod.susercontent.com/product.mp4',src:'',querySelectorAll:()=>[],play:()=>{plays++;return Promise.resolve();}}];}};
 const icon={getClientRects:()=>hidden?[]:[{}],closest:selector=>selector.startsWith('a[href]')?(excluded?{}:null):control,parentElement:control};
 const root={querySelector:()=>videos[0]||null,querySelectorAll:selector=>selector==='video'?videos:[icon]};
 const document={title:'Product',querySelector:selector=>selector==='.product-briefing'?root:null,querySelectorAll:()=>[]};
 const context={document,performance:{getEntriesByType:()=>resources.map(name=>({name}))},getComputedStyle:()=>({visibility:'visible'}),MouseEvent:class{constructor(type){this.type=type;}}};
 return {probe:()=>vm.runInNewContext(media.mediaScript,context),stats:()=>({clicks,plays,events}),setVideos:value=>{videos=value;}};
}
test('activates thumbnail before discovering lazy video, then plays without clicking twice',()=>{
 const p=page();const first=p.probe();assert.equal(first.activated,true);assert.equal(first.urls[0],'https://down-vn.vod.susercontent.com/product.mp4');
 p.probe();assert.equal(p.stats().clicks,1);assert.equal(p.stats().plays,2);assert.deepEqual(p.stats().events,['mouseover','mouseenter']);
});
test('never clicks purchase controls, links, variants or invisible thumbnails',()=>{
 for(const options of [{label:'Mua ngay'},{label:'Add to cart'},{excluded:true},{hidden:true}]){const p=page(options);assert.equal(p.probe().activated,false);assert.equal(p.stats().clicks,0);}
});
test('finds MP4 resource underneath blob and collects multiple video/source elements',()=>{
 const p=page({resources:['https://down-vn.vod.susercontent.com/actual.mp4?token=test']});
 p.setVideos([{currentSrc:'blob:test',src:'',play:()=>Promise.resolve(),querySelectorAll:()=>[{src:'https://down-vn.vod.susercontent.com/master.m3u8'}]}]);
 const result=p.probe();assert.equal(result.urls.find(media.downloadableVideo),'https://down-vn.vod.susercontent.com/actual.mp4?token=test');
});
test('does not download manifests, blob URLs or foreign hosts as MP4',()=>{
 for(const value of ['blob:video','https://down-vn.vod.susercontent.com/video.m3u8','https://down-vn.vod.susercontent.com/video.mpd?x=1','https://evil.test/video.mp4'])assert.equal(media.downloadableVideo(value),false);
 assert.equal(media.downloadableVideo('https://down-vn.vod.susercontent.com/video-resource'),true);
});
