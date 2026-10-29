const {downloadableVideo}=require('./shopee-media.cjs');

// Only read video fields belonging to the requested item, never recommendation lists.
function productVideos(payload,identity,requestMatches=false){
 const [shop,item]=identity.split(':');const urls=new Set();
 function media(value){
  if(typeof value==='string'){if(downloadableVideo(value))urls.add(value);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value))if(!/image|thumbnail|cover/i.test(key))media(child);
 }
 function visit(value,matched=false){
  if(!value||typeof value!=='object')return;
  const itemId=value.itemid??value.item_id,shopId=value.shopid??value.shop_id;
  if(itemId!=null&&String(itemId)!==item||shopId!=null&&String(shopId)!==shop)return;
  matched=matched||(String(itemId)===item&&String(shopId)===shop);
  for(const [key,child] of Object.entries(value)){
   if(/recommend|related|rating|review/i.test(key))continue;
   if(matched&&/video/i.test(key))media(child);
   else if(child&&typeof child==='object')visit(child,matched);
  }
 }
 visit(payload,requestMatches);return [...urls];
}

async function createMediaCapture(wc,{timeout=5000}={}){
 const debug=wc.debugger;let identity='',epoch=0,urls=new Set(),pending=new Map(),diagnostics={};
 debug.attach('1.3');
 const listener=async(_event,method,params)=>{
  if(!identity)return;
  if(method==='Network.responseReceived'){
   const r=params.response;let u;try{u=new URL(r.url);}catch{return;}
   // Product detail responses contain item-scoped video metadata, even before playback.
   if(u.hostname==='shopee.vn'&&/^\/api\/v\d+\/(?:item\/get|pdp\/get(?:_pc)?)(?:\/|$)/.test(u.pathname)){
    diagnostics.http=r.status;
    const [shop,item]=identity.split(':');
    const requestMatches=(u.searchParams.get('item_id')||u.searchParams.get('itemid'))===item&&(u.searchParams.get('shop_id')||u.searchParams.get('shopid'))===shop;
    if(r.status===200)pending.set(params.requestId,{epoch,identity,requestMatches});
   }
  }else if(method==='Network.loadingFailed')pending.delete(params.requestId);
  else if(method==='Network.loadingFinished'){
   const request=pending.get(params.requestId);pending.delete(params.requestId);
   if(!request||request.epoch!==epoch)return;
   try{
    const result=await debug.sendCommand('Network.getResponseBody',{requestId:params.requestId});
    if(request.epoch!==epoch||result.body.length>20*1024*1024)return;
    const payload=JSON.parse(result.base64Encoded?Buffer.from(result.body,'base64').toString('utf8'):result.body);
    diagnostics.read=true;diagnostics.apiError=payload.error??null;
    for(const url of productVideos(payload,request.identity,request.requestMatches))urls.add(url);
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
 return {reset(id){identity=id;epoch++;urls.clear();pending.clear();diagnostics={};},urls:()=>[...urls],diagnostics:()=>({...diagnostics}),dispose(){epoch++;identity='';pending.clear();cleanup();}};
}
module.exports={productVideos,createMediaCapture};
