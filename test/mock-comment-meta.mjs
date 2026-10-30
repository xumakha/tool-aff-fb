// Loaded only by the isolated comment UI test. All Meta traffic is mocked.
import {appendFile} from 'node:fs/promises';
const posts=['1_10','1_11','1_12'].map(id=>({id,message:'Đèn ngủ',from:{id:'1'},is_published:true}));
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);
 if(url.hostname!=='graph.facebook.com')throw Error('Unexpected external request in mock');
 const path=url.pathname.replace(/^\/v99\.0\//,'');let result;
 if(options.method==='POST'){
  if(path!=='1_10/comments')throw Error('Unexpected comment target');
  await appendFile(process.env.MOCK_COMMENT_LOG,JSON.stringify({postId:'1_10',message:options.body.get('message')})+'\n');result={id:'1_10_50'};
 }else if(path==='1/published_posts')result={data:posts};
 else if(path==='1_10/comments')result={data:[{id:'2_20',from:{id:'2'},comment_count:0}]};
 else if(path==='1_11/comments')result={data:[{id:'1_21',from:{id:'1'},comment_count:0}]};
 else if(path==='1_12/comments')result={data:[{id:'2_22',comment_count:0}]};
 else if(path==='1_10')result=posts[0];
 else throw Error('Unexpected Meta API path in mock: '+path);
 return {ok:true,status:200,json:async()=>result};
};
