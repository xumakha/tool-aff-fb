const {downloadableVideo}=require('./shopee-media.cjs');
const {productIdentity}=require('./shopee-downloads.cjs');
const {mediaSchema}=require('./shopee-diagnostics.cjs');

// Shopee's own videoInfo resolver uses these two routes when mms_data is absent.
// Verified in the live product bundle (see README); this app supports VN items.
function videoInfoURL(id){
 if(typeof id!=='string')return null;
 if(/^api\/v4\/[a-z\d_./-]+\.mp4$/i.test(id)&&!id.split('/').some(part=>part==='.'||part==='..'))return 'https://mms.vod.susercontent.com/'+id;
 if(/^[a-f\d]{32}$/i.test(id))return 'https://cvf.shopee.vn/file/'+id;
 return null;
}

// Only read video fields belonging to the requested item, never recommendation lists.
function productVideos(payload,identity,requestMatches=false){
 const [shop,item]=identity.split(':');const urls=new Set();
 const excluded=/image|thumb|cover|poster|snapshot|avatar|description|caption|title|tracking|recommend|related|rating|review/i;
 function add(value,base){
  if(typeof value!=='string')return;
  // Keep the exact signed URL. Relative paths require an explicit CDN URL in
  // the same metadata; a video ID alone does not establish a download host.
  let candidate=value.trim();
  if(candidate.startsWith('//'))candidate='https:'+candidate;
  else if(base&&!/^[a-z][a-z\d+.-]*:/i.test(candidate)&&/^\/?api\/v\d+\/[^?#]+\.mp4(?:[?#]|$)/i.test(candidate))candidate=new URL('/'+candidate.replace(/^\//,''),base).href;
  if(downloadableVideo(candidate))urls.add(candidate);
 }
 function media(value,key='',base='',depth=0){
  if(depth>30)return;
  if(typeof value==='string'){
   if(/^(?:mms_?data|video_?(?:data|info))$/i.test(key)&&value.length<1024*1024&&/^[\s]*[\[{]/.test(value)){
    try{media(JSON.parse(value),'',base,depth+1);}catch{/* Malformed optional metadata must not hide another format. */}
   }else if(!key||/^(?:url|src|path|file|play_?url|download_?url|video(?:_?(?:url|urls|id|link|links))?)$/i.test(key))add(value,base);
   return;
  }
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const child of value)media(child,key,base,depth+1);return;}
  const declaredURL=[value.url,value.video_url,value.default_format?.url,...(Array.isArray(value.formats)?value.formats.map(format=>format?.url):[])].find(candidate=>typeof candidate==='string'&&downloadableVideo(candidate));
  if(declaredURL)base=declaredURL;
  const manifest=/^(?:HLS|M3U8|DASH|MPD)$/i.test(value.profile||value.type||'');
  // Prefer actual encodings over thumbnails and metadata-service defaults.
  const entries=Object.entries(value).sort(([a],[b])=>Number(b==='formats')-Number(a==='formats'));
  for(const [childKey,child] of entries){
   if(excluded.test(childKey))continue;
   if(manifest&&typeof child==='string'&&!/data|info/i.test(childKey))continue;
   media(child,childKey,base,depth+1);
  }
  const fallback=videoInfoURL(value.video_id);
  if(!manifest&&fallback)urls.add(fallback);
 }
 function visit(value,matched=false){
  if(!value||typeof value!=='object')return;
  const itemId=value.itemid??value.item_id,shopId=value.shopid??value.shop_id;
  if(itemId!=null&&String(itemId)!==item||shopId!=null&&String(shopId)!==shop)return;
  matched=matched||(String(itemId)===item&&String(shopId)===shop);
  for(const [key,child] of Object.entries(value)){
   if(/recommend|related|rating|review/i.test(key))continue;
   if(matched&&/video/i.test(key)&&!excluded.test(key))media(child,key);
   else if(child&&typeof child==='object')visit(child,matched);
  }
 }
 visit(payload,requestMatches);return [...urls];
}

async function createMediaCapture(wc,{timeout=5000}={}){
 const debug=wc.debugger;let identity='',epoch=0,urls=new Set(),observedURLs=new Set(),pending=new Map(),requests=new Map(),diagnostics={};
 const detailURL=u=>['shopee.vn','www.shopee.vn'].includes(u.hostname)&&/^\/api\/v\d+\/(?:item\/get|pdp\/get(?:_pc)?)(?:\/|$)/.test(u.pathname);
 function requestIdentity(u,postData){
  let body={};try{body=JSON.parse(postData||'{}');}catch{try{body=Object.fromEntries(new URLSearchParams(postData));}catch{}}
  return {shop:u.searchParams.get('shop_id')||u.searchParams.get('shopid')||body?.shop_id||body?.shopid,item:u.searchParams.get('item_id')||u.searchParams.get('itemid')||body?.item_id||body?.itemid};
 }
 debug.attach('1.3');
 const listener=async(_event,method,params)=>{
  if(!identity)return;
  if(method==='Network.requestWillBeSent'){
   let u;try{u=new URL(params.request.url);}catch{return;}
   if(!detailURL(u)&&!downloadableVideo(u.href))return;
   if(requests.size>=2000)requests.delete(requests.keys().next().value);
   requests.set(params.requestId,{epoch,identity,documentMatches:productIdentity(params.documentURL)?.id===identity,postData:params.request.postData});
  }else if(method==='Network.responseReceived'){
   const r=params.response;let u;try{u=new URL(r.url);}catch{return;}
   const started=requests.get(params.requestId);
   // Product detail responses contain item-scoped video metadata, even before playback.
   if(detailURL(u)){
    // A response can arrive after reset even though its request belonged to the
    // previous page. Only requests observed in this capture epoch are eligible.
    if(!started||started.epoch!==epoch||started.identity!==identity)return;
    const [shop,item]=identity.split(':');
    const requested=requestIdentity(u,started?.postData);
    if(requested.shop!=null&&String(requested.shop)!==shop||requested.item!=null&&String(requested.item)!==item)return;
    diagnostics.http=r.status;
    const requestMatches=String(requested.item)===item&&String(requested.shop)===shop;
    if(r.status===200)pending.set(params.requestId,{epoch,identity,requestMatches});
   }else if(started?.epoch===epoch&&started.identity===identity&&started.documentMatches&&[200,206].includes(r.status)&&/^(?:video\/(?:mp4|x-m4v)|application\/mp4)(?:;|$)/i.test(r.mimeType||'')&&downloadableVideo(r.url)&&! /\.(?:m4s|ts)(?:[?#]|$)/i.test(u.pathname)){
    if(!observedURLs.has(r.url)){observedURLs.add(r.url);diagnostics.networkSources=observedURLs.size;}
   }
  }else if(method==='Network.loadingFailed'){pending.delete(params.requestId);requests.delete(params.requestId);}
  else if(method==='Network.loadingFinished'){
   requests.delete(params.requestId);
   const request=pending.get(params.requestId);pending.delete(params.requestId);
   if(!request||request.epoch!==epoch)return;
   try{
    const result=await debug.sendCommand('Network.getResponseBody',{requestId:params.requestId});
    if(request.epoch!==epoch||result.body.length>20*1024*1024)return;
    const payload=JSON.parse(result.base64Encoded?Buffer.from(result.body,'base64').toString('utf8'):result.body);
    diagnostics.read=true;diagnostics.apiError=payload.error??null;
    const sources=productVideos(payload,request.identity,request.requestMatches);
    diagnostics.requestMatched=request.requestMatches;
    if(!sources.length)diagnostics.mediaSchema=mediaSchema(payload);
    for(const url of sources)urls.add(url);diagnostics.metadataSources=sources.length;
   }catch{if(request.epoch===epoch)diagnostics.bodyUnavailable=true;}
  }
 };
 debug.on('message',listener);
 const cleanup=()=>{
  debug.removeListener('message',listener);
  // Electron may already have destroyed the native debugger when the window closes.
  try{if(!wc.isDestroyed?.()&&debug.isAttached())debug.detach();}catch{/* Renderer teardown can race this cleanup. */}
 };
 let timer;
 try{await Promise.race([debug.sendCommand('Network.enable'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Hết thời gian khởi tạo bộ dò mạng')),timeout);})]);}
 catch(error){cleanup();throw error;}
 finally{clearTimeout(timer);}
 return {reset(id){identity=id;epoch++;urls.clear();observedURLs.clear();pending.clear();requests.clear();diagnostics={};},urls:()=>[...new Set([...urls,...observedURLs])],diagnostics:()=>({...diagnostics}),dispose(){epoch++;identity='';pending.clear();requests.clear();cleanup();}};
}
module.exports={productVideos,createMediaCapture,videoInfoURL};
