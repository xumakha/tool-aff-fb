const {videoURL}=require('./shopee-url.cjs');
// Runs in the page. Limit clicks to explicit video controls in product information.
function probeProductMedia(){
 const selector='[aria-label*="video" i],[aria-label*="play" i],[data-testid*="video" i],.icon-play,.shopee-svg-icon.icon-play,.shopee_ic_video,.shopee_ic .stroke-none,.shopee_ic.stroke-none';
 const excluded='a[href],.product-variation,[role="option"],.product-detail,.shopee-product-rating,[data-testid*="recommend" i],[data-testid*="review" i]';
 let root=document.querySelector('.product-briefing')||document.querySelector('[data-sqe="product-info"]');
 // New layouts can omit both product wrappers. Stay within a video player's
 // ancestors instead of clicking arbitrary play-looking icons across the page.
 if(!root){
  for(const video of document.querySelectorAll('video')){
   if(video.closest(excluded)||!video.getClientRects().length)continue;
   let candidate=video.parentElement;
   for(let depth=0;candidate&&depth<5;depth++,candidate=candidate.parentElement){
    if(['BODY','HTML','MAIN'].includes(candidate.tagName)||candidate.querySelector('h1,button[name="buy"]'))break;
    if(candidate.querySelector(selector)){root=candidate;break;}
   }
   if(root)break;
  }
 }
 let activated=false;
 if(root&&!Array.from(root.querySelectorAll('video')).some(v=>v.currentSrc||v.src)){
  for(const icon of root.querySelectorAll(selector)){
   if(!icon.getClientRects().length||getComputedStyle(icon).visibility==='hidden')continue;
   if(icon.closest(excluded))continue;
   const control=icon.closest('button,[role="button"]')||icon.parentElement;
   if(!control||control===root||control.dataset.reelsVideoActivated||control.disabled||control.getAttribute('aria-disabled')==='true')continue;
   const label=(control.innerText||'').trim();
   if(/mua|gio hang|buy|cart|chat|theo doi|follow/i.test(label))continue;
   control.dataset.reelsVideoActivated='1';
   control.scrollIntoView({block:'center'});
   for(const type of ['mouseover','mouseenter'])control.dispatchEvent(new MouseEvent(type,{bubbles:true}));
   control.click();activated=true;break;
  }
 }
 const videos=Array.from((root||document).querySelectorAll('video'));
 const urls=[];
 for(const video of videos){video.muted=true;video.play()?.catch(()=>{});urls.push(video.currentSrc,video.src,...Array.from(video.querySelectorAll('source')).map(s=>s.src));}
 // A blob player can still request an ordinary MP4 resource underneath.
 for(const entry of performance.getEntriesByType('resource'))if(/\.(mp4|m3u8)(?:[?#]|$)/i.test(entry.name)||entry.initiatorType==='video')urls.push(entry.name);
 const title=document.querySelector('h1')?.innerText||document.querySelector('meta[property="og:title"]')?.content||document.title;
 return {title,urls:[...new Set(urls.filter(Boolean))],activated,players:videos.length,productRoot:!!root};
}
// Read textContent so CSS truncation does not shorten the exported product name.
function productTitle(){return (document.querySelector('h1')?.textContent||document.querySelector('meta[property="og:title"]')?.content||'').replace(/\s*\|\s*Shopee.*$/i,'').trim();}
const productTitleScript=`(${productTitle.toString()})()`;
const mediaScript=`(()=>{const data=(${probeProductMedia.toString()})();data.title=(${productTitle.toString()})()||data.title;return data;})()`;
function downloadableVideo(value){return videoURL(value)&&! /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(value);}
module.exports={mediaScript,downloadableVideo,productTitleScript};
