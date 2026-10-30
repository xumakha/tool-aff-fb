// Read-only diagnostic for the installed app. Never prints tokens/config values
// and never sends a write request to Meta.
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createDecipheriv}=require('node:crypto');
const {readSettings}=require('../desktop/settings.cjs');
(async()=>{
 const home=path.join(process.env.APPDATA,'Reels Desk PC'),config=readSettings(path.join(home,'.env'));
 const db=new DatabaseSync(path.join(home,'data','reels.sqlite'),{readOnly:true});
 let run,item,page;
 try{run=db.prepare('SELECT id,page_id FROM affiliate_comment_runs ORDER BY created DESC LIMIT 1').get();item=db.prepare("SELECT post_id FROM affiliate_comment_items WHERE run_id=? AND status='unknown' AND reason LIKE 'Meta API: 10.%' LIMIT 1").get(run.id);page=db.prepare('SELECT token FROM pages WHERE id=?').get(run.page_id);}finally{db.close();}
 if(!item)throw Error('No permission-error item in the latest run');
 const [iv,tag,bytes]=page.token.split('.').map(value=>Buffer.from(value,'hex'));
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(config.TOKEN_ENCRYPTION_KEY,'hex'),iv);decipher.setAuthTag(tag);const token=Buffer.concat([decipher.update(bytes),decipher.final()]).toString();
 const redact=value=>String(value||'').split(token).join('[TOKEN]').split(config.META_APP_SECRET||'never-match-empty-secret').join('[SECRET]').replace(/https?:\/\/\S+/g,'[URL]');
 const requests=[['page identity','me',{fields:'id'}],['current comment query',item.post_id+'/comments',{fields:'id,from,comment_count',filter:'toplevel',order:'chronological',summary:'true',limit:'1'}],['minimal comment query',item.post_id+'/comments',{fields:'id',limit:'1'}]];
 for(const [label,endpoint,params] of requests){
  const url=new URL(`https://graph.facebook.com/${config.META_GRAPH_VERSION}/${endpoint}`);url.search=new URLSearchParams(params);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}),data=await response.json();
  console.log(JSON.stringify({label,http:response.status,pageIdentityMatches:label==='page identity'?String(data.id)===run.page_id:undefined,returnedRows:Array.isArray(data.data)?data.data.length:undefined,error:data.error?{code:data.error.code,subcode:data.error.error_subcode,message:redact(data.error.message)}:null}));
 }
})().catch(error=>{console.error(error.code||'Diagnostic failed');process.exitCode=1;});
