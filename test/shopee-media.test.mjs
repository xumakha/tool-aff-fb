import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import media from '../desktop/shopee-media.cjs';
test('product title preserves full Unicode text beyond filename limits',()=>{
 const title='Máy giặt mini gấp gọn, máy giặt đồ lót, tất vớ, giặt đồ cho bé dung tích 6L tự vắt khô khử khuẩn bằng công nghệ mới';
 const document={querySelector:selector=>selector==='h1'?{textContent:title,innerText:title.slice(0,100)}:null};
 assert.equal(vm.runInNewContext(media.productTitleScript,{document}),title);
});
function page({label='',excluded=false,hidden=false,playerHidden=false,resources=[],otherVideos=[],newLayout=false,nesting=0,triangle=false,containsHeading=false}={}){
 let videos=[],clicks=0,plays=0;const events=[];
 const control={dataset:{},disabled:false,innerText:label,getAttribute:()=>null,scrollIntoView:()=>{},dispatchEvent:event=>events.push(event.type),click:()=>{clicks++;videos=[{currentSrc:'https://down-vn.vod.susercontent.com/product.mp4',src:'',querySelectorAll:()=>[],play:()=>{plays++;return Promise.resolve();}}];}};
 const icon={getClientRects:()=>hidden?[]:[{}],closest:selector=>selector.startsWith('a[href]')?(excluded?{}:null):selector==='svg'?(triangle?icon:null):control,parentElement:control,
  querySelectorAll:()=>[{tagName:typeof triangle==='object'?'path':'polygon',getAttribute:()=>triangle===true?'2,2 2,14 12,8':typeof triangle==='object'?triangle.path:triangle}]};
 const root={tagName:'DIV',querySelector:selector=>selector==='h1,button[name="buy"]'?(containsHeading?{}:null):newLayout?icon:videos[0]||null,querySelectorAll:selector=>selector==='video'?videos:selector==='svg'?(triangle?[icon]:[]):triangle?[]:[icon]};
 const document={title:'Product',querySelector:selector=>selector==='.product-briefing'&&!newLayout?root:null,querySelectorAll:()=>[...videos,...otherVideos]};
 const context={document,performance:{getEntriesByType:()=>resources.map(value=>typeof value==='string'?{name:value}:value)},getComputedStyle:()=>({visibility:'visible'}),MouseEvent:class{constructor(type){this.type=type;}}};
 return {probe:()=>vm.runInNewContext(media.mediaScript,context),stats:()=>({clicks,plays,events}),setVideos:value=>{videos=value;for(const v of videos){v.closest=()=>excluded?{}:null;v.getClientRects=()=>hidden||playerHidden?[]:[{}];let parent=root;for(let depth=0;depth<nesting;depth++)parent={tagName:'DIV',parentElement:parent,querySelector:()=>null,querySelectorAll:()=>[]};v.parentElement=parent;}}};
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
 for(const value of ['blob:video','https://down-vn.vod.susercontent.com/video.m3u8','https://down-vn.vod.susercontent.com/video.mpd?x=1','https://evil.test/video.mp4','https://down-vn.img.susercontent.com/poster.jpg','https://down-vn.img.susercontent.com/cover.webp?x=1','https://down-vn.vod.susercontent.com/segment.m4s','https://down-vn.vod.susercontent.com/segment.ts'])assert.equal(media.downloadableVideo(value),false);
 assert.equal(media.downloadableVideo('https://down-vn.vod.susercontent.com/video-resource'),true);
});

 test('activates an existing player with no source and detects extensionless video requests',()=>{
 const p=page();p.setVideos([{currentSrc:'',src:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
 assert.equal(p.probe().activated,true);
 const resource='https://down-vn.vod.susercontent.com/opaque-resource';
 const q=page({hidden:true,resources:[{name:resource,initiatorType:'video'}]});
 q.setVideos([{currentSrc:'blob:product',src:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
 assert.equal(q.probe().urls.find(media.downloadableVideo),resource);
 });

test('activates a source-less video using nearby controls when legacy product wrappers are absent',()=>{
 const p=page({newLayout:true});p.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
 const result=p.probe();assert.equal(result.productRoot,true);assert.equal(result.activated,true);assert.equal(result.urls[0],'https://down-vn.vod.susercontent.com/product.mp4');
 const excluded=page({newLayout:true,excluded:true});excluded.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);assert.equal(excluded.probe().activated,false);
});

test('activates the visible thumbnail of a hidden, deeply nested lazy gallery video',()=>{
 const p=page({newLayout:true,playerHidden:true,nesting:6});
 p.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
 const result=p.probe();assert.equal(result.productRoot,true);assert.equal(result.activated,true);
 assert.equal(result.urls[0],'https://down-vn.vod.susercontent.com/product.mp4');assert.equal(p.stats().clicks,1);
});

test('recognizes an unlabelled SVG play triangle but ignores arrows and other polygons',()=>{
 for(const triangle of [true,'12,2 12,14 2,8','2,2 8,8 2,14 4,8','2,2 12,2 8,14']){
  const p=page({newLayout:true,playerHidden:true,triangle});
  p.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
  assert.equal(p.probe().activated,triangle===true);
 }
});

test('only accepts simple absolute SVG triangle paths, not relative, curved or open shapes',()=>{
 for(const [path,expected] of [['M2 2 L2 14 L12 8 Z',true],['M2,2 2,14 12,8Z',true],['m2 2 l0 12 l10 -6 z',false],['M2 2 C2 14 12 8 2 2Z',false],['M2 2 L2 14 L12 8',false],['M12 2 L12 14 L2 8 Z',false]]){
  const p=page({newLayout:true,playerHidden:true,triangle:{path}});
  p.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
  assert.equal(p.probe().activated,expected,path);
 }
});

test('resource fallback skips known review/recommendation URLs and requires a product player',()=>{
 const review='https://down-vn.vod.susercontent.com/review.mp4';
 const reviewPlayer={src:review,currentSrc:review,closest:()=>({}),querySelectorAll:()=>[]};
 const empty=page({hidden:true,resources:[review],otherVideos:[reviewPlayer]});
 assert.equal(empty.probe().urls.length,0);
 const p=page({resources:[review,'https://down-vn.vod.susercontent.com/product.mp4'],otherVideos:[reviewPlayer]});
 p.setVideos([{src:'',currentSrc:'blob:product',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
 assert.deepEqual(Array.from(p.probe().urls),['blob:product','https://down-vn.vod.susercontent.com/product.mp4']);
});

test('does not cross into the product heading/purchase area or activate hidden/excluded controls',()=>{
 for(const options of [{containsHeading:true},{hidden:true},{excluded:true}]){
  const p=page({newLayout:true,playerHidden:true,nesting:6,triangle:true,...options});
  p.setVideos([{src:'',currentSrc:'',play:()=>Promise.resolve(),querySelectorAll:()=>[]}]);
  assert.equal(p.probe().activated,false);assert.equal(p.stats().clicks,0);
 }
 for(const label of ['Giỏ hàng','Thêm vào giỏ hàng','Theo dõi'])assert.equal(page({label}).probe().activated,false);
});
