import {appendFileSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);
 if(url.hostname==='rupload.facebook.com'){
  for await(const chunk of options.body || [])void chunk;
  return {ok:true,status:200,json:async()=>({success:true})};
 }
 if(url.hostname==='graph.facebook.com'){
  const body=options.body;
  if(body?.get('upload_phase')==='start')return {ok:true,status:200,json:async()=>({video_id:'mock-video',upload_url:'https://rupload.facebook.com/video-upload/mock'})};
  if(body?.get('upload_phase')==='finish'){
   appendFileSync(process.env.MOCK_META_LOG,JSON.stringify({state:body.get('video_state'),due:body.get('scheduled_publish_time')})+'\n');
   return {ok:true,status:200,json:async()=>({success:true})};
  }
 }
 return original(input,options);
};
