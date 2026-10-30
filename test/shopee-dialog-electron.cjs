const assert=require('node:assert/strict');
const {mediaScript}=require('../desktop/shopee-media.cjs');
module.exports=async function testDialogs(win){
 const videoURL='https://down-vn.vod.susercontent.com/dialog-product.mp4';
 const unrelated='https://down-vn.vod.susercontent.com/unrelated.mp4';
 await win.loadURL('data:text/html,'+encodeURIComponent('<div class="product-briefing"><button aria-label="play video">Play</button><video id="gallery"></video></div><div role="dialog" id="existing"><video></video></div>'));
 await win.webContents.executeJavaScript(`
  window.clicks=0;
  const fakeSource=(video,url)=>{Object.defineProperty(video,'currentSrc',{configurable:true,value:url});video.play=()=>Promise.resolve();};
  fakeSource(document.querySelector('#existing video'),${JSON.stringify(unrelated)});
  document.querySelector('#gallery').play=()=>Promise.resolve();
  document.querySelector('button').onclick=()=>{
   window.clicks++;
   const node=document.createElement('div');node.role='dialog';node.id='product-modal';node.innerHTML='<div class="I88JaR"><video class="TZ9_Zu"></video><div class="KKyjj0"></div></div>';document.body.append(node);node.querySelector('video').play=()=>Promise.resolve();
   const review=document.createElement('div');review.role='dialog';review.className='shopee-product-rating';review.innerHTML='<video></video>';document.body.append(review);fakeSource(review.querySelector('video'),${JSON.stringify(unrelated)});
  }; true;
 `);
 const first=await win.webContents.executeJavaScript(mediaScript,true);
 assert.equal(first.activated,true);assert.equal(first.urls.length,0);
 // The separate modal acquires its source later, as network responses arrive.
 await win.webContents.executeJavaScript(`Object.defineProperty(document.querySelector('#product-modal video'),'currentSrc',{configurable:true,value:${JSON.stringify(videoURL)}});true;`);
 const second=await win.webContents.executeJavaScript(mediaScript,true);
 assert.ok(second.urls.includes(videoURL));assert.ok(!second.urls.includes(unrelated));
 assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);
 await win.webContents.executeJavaScript(`document.querySelector('#product-modal').remove();true;`);
 assert.ok(!(await win.webContents.executeJavaScript(mediaScript,true)).urls.includes(videoURL));
 console.log('PASS: two-stage product video dialog is tracked; existing/review dialogs and removed players excluded');
};
