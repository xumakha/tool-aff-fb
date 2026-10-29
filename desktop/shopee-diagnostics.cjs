// Record structure only: never retain API response values, cookies, URLs, page
// text, form inputs or complete HTML from the user's authenticated browser.
function mediaSchema(payload){
 const fields=[];let visited=0;
 function visit(value,path='',inside=false,depth=0){
  if(depth>12||++visited>5000||fields.length>=100)return;
  if(inside){
   const field={path,type:Array.isArray(value)?'array':value===null?'null':typeof value};
   if(Array.isArray(value))field.count=value.length;
   if(typeof value==='string'){
    field.length=value.length;
    field.kind=/^https?:\/\//i.test(value)?'absolute-url':/^\/\//.test(value)?'protocol-relative':/\.mp4(?:[?#]|$)/i.test(value)?'mp4-path':/^\s*[\[{]/.test(value)?'json-string':'string';
   }
   fields.push(field);
  }
  if(Array.isArray(value)){if(value.length)visit(value[0],path+'[]',inside,depth+1);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(!/^[a-z_][a-z_\d]{0,63}$/i.test(key)||/token|cookie|auth|password|email|phone|address|recommend|review|rating/i.test(key))continue;
   visit(child,path?path+'.'+key:key,inside||/video|mms|media/i.test(key),depth+1);
  }
 }
 visit(payload);return fields;
}
function galleryStructure(){
 const describe=node=>({tag:node.tagName,class:(node.getAttribute('class')||'').slice(0,250),role:node.getAttribute('role'),visible:!!node.getClientRects().length});
 return Array.from(document.querySelectorAll('video')).slice(0,3).map(video=>{
  const ancestors=[];let node=video;
  for(let depth=0;node&&depth<10;depth++,node=node.parentElement){
   if(['BODY','HTML','MAIN'].includes(node.tagName))break;
   const info=describe(node);
   info.images=node.querySelectorAll('img').length;info.headings=node.querySelectorAll('h1').length;
   info.children=Array.from(node.children).slice(0,15).map(describe);
   info.icons=Array.from(node.querySelectorAll('svg')).slice(0,12).map(svg=>({...describe(svg),parent:svg.parentElement?describe(svg.parentElement):null,shapes:Array.from(svg.querySelectorAll('path,polygon')).slice(0,3).map(shape=>({tag:shape.tagName,d:(shape.getAttribute('d')||shape.getAttribute('points')||'').slice(0,1600)}))}));
   ancestors.push(info);
   if(info.headings)break;
  }
  return {readyState:video.readyState,networkState:video.networkState,hasSource:!!(video.currentSrc||video.getAttribute('src')),ancestors};
 });
}
module.exports={mediaSchema,galleryStructureScript:`(${galleryStructure.toString()})()`};
