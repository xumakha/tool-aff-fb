const {videoURL}=require('./shopee-url.cjs');
// Runs in the page. Limit clicks to explicit video controls in product information.
function probeProductMedia(){
 const selector='[aria-label*="video" i],[aria-label*="play" i],[aria-label*="phát" i],[title*="video" i],[data-testid*="video" i],.icon-play,.shopee-svg-icon.icon-play,.shopee_ic_video,.shopee_ic .stroke-none,.shopee_ic.stroke-none';
 const excluded='a[href],.product-variation,[role="option"],.product-detail,.shopee-product-rating,[data-testid*="recommend" i],[data-testid*="review" i]';
 // Recognize unlabelled SVG play triangles as well as the old icon classes.
 // Only recognize a single, closed triangle pointing right; generic SVGs can be
 // carousel arrows, purchase controls or decorative badges.
 function playTriangle(svg){
  const shapes=svg.querySelectorAll('path,polygon');if(shapes.length!==1)return false;
  const shape=shapes[0];let points;
  if(shape.tagName.toLowerCase()==='polygon')points=shape.getAttribute('points');
  else{
   const d=(shape.getAttribute('d')||'').trim();
   if(!/^M\s*[-\d.,\s]+(?:L\s*[-\d.,\s]+){0,2}\s*Z$/.test(d))return false;
   points=d.replace(/[MLZ]/g,' ');
  }
  const coordinates=(points||'').trim().split(/[\s,]+/).map(Number);
  if(coordinates.length!==6||coordinates.some(n=>!Number.isFinite(n)))return false;
  const p=[0,2,4].map(i=>({x:coordinates[i],y:coordinates[i+1]})).sort((a,b)=>a.x-b.x);
  const width=p[2].x-p[0].x,height=Math.abs(p[1].y-p[0].y);
  return width>0&&height>0&&Math.abs(p[1].x-p[0].x)<=width*.1&&p[2].y>Math.min(p[0].y,p[1].y)&&p[2].y<Math.max(p[0].y,p[1].y);
 }
 const controls=element=>[...new Set([...element.querySelectorAll(selector),...Array.from(element.querySelectorAll('svg')).filter(playTriangle)])];
 let root=document.querySelector('.product-briefing')||document.querySelector('[data-sqe="product-info"]')||document.querySelector('[data-testid="product-gallery"],[data-testid="product-images"],[data-sqe="product-images"]');
 // New layouts can omit both product wrappers. Stay within a video player's
 // ancestors instead of clicking arbitrary play-looking icons across the page.
 if(!root){
  for(const video of document.querySelectorAll('video')){
   // Unselected video slides are normally hidden and have no source yet. The
   // visible thumbnail can be a sibling of several nested player wrappers.
   if(video.closest(excluded))continue;
   let candidate=video.parentElement;
   for(let depth=0;candidate&&depth<10;depth++,candidate=candidate.parentElement){
    if(['BODY','HTML','MAIN'].includes(candidate.tagName)||candidate.querySelector('h1,button[name="buy"]'))break;
    if(controls(candidate).some(icon=>icon.getClientRects().length&&!icon.closest(excluded))){root=candidate;break;}
   }
   if(root)break;
  }
 }
 let activated=false;
 if(root&&!Array.from(root.querySelectorAll('video')).some(v=>v.currentSrc||v.src)){
  for(const icon of controls(root)){
   if(!icon.getClientRects().length||getComputedStyle(icon).visibility==='hidden')continue;
   if(icon.closest(excluded))continue;
   const control=icon.closest('button,[role="button"]')||icon.closest('svg')?.parentElement||icon.parentElement;
   if(!control||control===root||control.dataset.reelsVideoActivated||control.disabled||control.getAttribute('aria-disabled')==='true')continue;
   const label=(control.innerText||'').trim();
   if(/mua|gi[oỏ] h[aà]ng|buy|cart|chat|theo d[oõ]i|follow/i.test(label))continue;
   control.dataset.reelsVideoActivated='1';
   control.scrollIntoView({block:'center'});
   for(const type of ['mouseover','mouseenter'])control.dispatchEvent(new MouseEvent(type,{bubbles:true}));
   control.click();activated=true;break;
  }
 }
 // The supplied diagnostics show a lazy player with a visible IMG sibling
 // inside `center VmNEQ6`, without any play icon. Click only that direct poster
 // inside the product gallery, never a placeholder logo or an unrelated image.
 if(!activated){
  for(const video of document.querySelectorAll('video')){
   if(video.currentSrc||video.src||video.closest?.(excluded))continue;
   const container=video.parentElement;
   if(!container||container.querySelector?.('h1,button,a[href],input'))continue;
   const poster=Array.from(container.children||[]).find(node=>node.tagName==='IMG');
   if(!poster||poster.dataset.reelsVideoActivated||!poster.getClientRects().length||getComputedStyle(poster).visibility==='hidden')continue;
   let gallery=container;
   for(let depth=0;gallery&&depth<10;depth++,gallery=gallery.parentElement){
    if(['BODY','HTML','MAIN'].includes(gallery.tagName)||gallery.querySelector('h1,button[name="buy"]')){gallery=null;break;}
    if(gallery.tagName==='SECTION'&&gallery.querySelectorAll('img').length>1)break;
   }
   if(!gallery||gallery.tagName!=='SECTION')continue;
   poster.dataset.reelsVideoActivated='1';poster.scrollIntoView({block:'center'});
   for(const type of ['mouseover','mouseenter'])poster.dispatchEvent(new MouseEvent(type,{bubbles:true}));
   poster.click();activated=true;root=root||gallery;break;
  }
 }
 const videos=Array.from((root||document).querySelectorAll('video')).filter(video=>!video.closest?.(excluded));
 const urls=[];
 for(const video of videos){video.muted=true;try{video.play()?.catch(()=>{});}catch{}urls.push(video.currentSrc,video.src,...Array.from(video.querySelectorAll('source')).map(s=>s.src));}
 // A blob player can still request an ordinary MP4 resource underneath. Do not
 // harvest page-wide media when no product player exists, or URLs belonging to
 // a known review/recommendation player outside the product gallery.
 const otherURLs=new Set();
 for(const video of document.querySelectorAll('video'))if(!videos.includes(video))for(const url of [video.currentSrc,video.src,...Array.from(video.querySelectorAll('source')).map(s=>s.src)])if(url)otherURLs.add(url);
 if(videos.length)for(const entry of performance.getEntriesByType('resource'))if(!otherURLs.has(entry.name)&&(/\.(mp4|m3u8)(?:[?#]|$)/i.test(entry.name)||entry.initiatorType==='video'))urls.push(entry.name);
 const title=document.querySelector('h1')?.innerText||document.querySelector('meta[property="og:title"]')?.content||document.title;
 return {title,urls:[...new Set(urls.filter(Boolean))],activated,players:videos.length,productRoot:!!root};
}
// Read textContent so CSS truncation does not shorten the exported product name.
function productTitle(){return (document.querySelector('h1')?.textContent||document.querySelector('meta[property="og:title"]')?.content||'').replace(/\s*\|\s*Shopee.*$/i,'').trim();}
const productTitleScript=`(${productTitle.toString()})()`;
const mediaScript=`(()=>{const data=(${probeProductMedia.toString()})();data.title=(${productTitle.toString()})()||data.title;return data;})()`;
function downloadableVideo(value){return videoURL(value)&&! /\.(?:m3u8|mpd|m4s|ts|jpe?g|png|webp|gif|avif|svg|ico)(?:[?#]|$)/i.test(value);}
module.exports={mediaScript,downloadableVideo,productTitleScript};
