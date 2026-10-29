// Explicit integration check: local HTTP + synthetic Shopee IPC, no network publishing.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'shopee-auto-'));let child;
async function start(){
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,AFFILIATE_MASTER_DIR:dir,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:''},stdio:['ignore','pipe','pipe','ipc']});
 const ready=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Startup timeout')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timeout);reject(Error('Server exited'));});child.on('message',m=>{if(m.type==='ready'){clearTimeout(timeout);resolve(m);}});});
 return `http://127.0.0.1:${ready.port}`;
}
async function stop(){const exited=once(child,'exit');child.kill();await exited;child=null;}
try{
 let base=await start();const file=join(dir,'product.mp4'),bytes=Buffer.alloc(24);bytes.write('ftyp',4);await writeFile(file,bytes);
 const request=async(path,input)=>{const response=await fetch(base+path,input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 child.send({type:'shopee-file',path:file,url:'https://shopee.vn/product/1/2',name:'product.mp4'});
 for(let i=0;i<100;i++){const s=await request('/api/affiliate/sources');if(s.count===1&&!s.running)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal((await request('/api/affiliate/sources')).count,1);
 await stop();base=await start();assert.equal((await request('/api/affiliate/sources')).count,1);
 const mapping=await request('/api/affiliate/inspect',{name:'aff.csv',data:Buffer.from('Original URL,Affiliate\nhttps://shopee.vn/product/1/2,https://s.shopee.vn/abc\n').toString('base64')});
 const input={mapping:{id:mapping.id,...mapping.suggestion}};
 assert.equal((await request('/api/affiliate/merge',input)).added,1);
 assert.equal((await request('/api/affiliate/merge',input)).duplicates,1);
 const state=await request('/api/state');assert.equal(state.media.length,1);assert.equal(state.media[0].affiliate_caption,'product.mp4\nhttps://s.shopee.vn/abc');
 child.send({type:'shopee-file',path:file,url:'https://shopee.vn/product/1/2',name:'product.mp4',reused:true});
 await new Promise(r=>setTimeout(r,100));assert.equal((await request('/api/state')).media.length,1);
 console.log('Shopee auto-import, restart persistence, automatic merge, caption and reuse checks passed');
}finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
