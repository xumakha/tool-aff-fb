// Explicit integration check: local HTTP + synthetic Shopee IPC, no network publishing.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const productName='Full product title '+ 'long name '.repeat(20);
const dir=await mkdtemp(join(tmpdir(),'shopee-auto-'));let child;
const reveals=[];
async function start(){
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,AFFILIATE_MASTER_DIR:dir,DESKTOP_MODE:'1',PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:''},stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',message=>{if(message.type==='reveal-shopee-export')reveals.push(message.path);});
 const ready=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Startup timeout')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timeout);reject(Error('Server exited'));});child.on('message',m=>{if(m.type==='ready'){clearTimeout(timeout);resolve(m);}});});
 return `http://127.0.0.1:${ready.port}`;
}
async function stop(){const exited=once(child,'exit');child.kill();await exited;child=null;}
try{
 let base=await start();const file=join(dir,'product.mp4'),bytes=Buffer.alloc(24);bytes.write('ftyp',4);await writeFile(file,bytes);
 const request=async(path,input)=>{const response=await fetch(base+path,input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 child.send({type:'shopee-file',path:file,url:'https://shopee.vn/product/1/2',name:'product.mp4',productName});
 for(let i=0;i<100;i++){const s=await request('/api/affiliate/sources');if(s.count===1&&!s.running)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal((await request('/api/affiliate/sources')).count,1);
 const exportFolder=join(dir,'Shop Shopee export');await mkdir(exportFolder);
 const exportFile=join(exportFolder,'Shopee Affiliate.xlsx');
 await writeFile(exportFile,'test export');await writeFile(join(exportFolder,'Ten va Link SP.xlsx'),'test names');
 // Upgrade discovers exports from known download folders; client paths are ignored.
 assert.equal((await request('/api/shopee/export/location',{path:join(dir,'unrelated.xlsx')})).path,exportFile);
 assert.equal(reveals.at(-1),exportFile);
 const original=(await request('/api/state')).media[0];assert.ok(original);
 const db=new DatabaseSync(join(dir,'reels.sqlite'));
 db.prepare('INSERT INTO jobs(id,page_id,media_id,due,created,status) VALUES(?,?,?,?,?,?)').run('retained-job','page',original.id,'2099-01-01','2026-01-01','remote_scheduled');
 // Also retain an unscheduled visible item, as encountered when closing the app mid-selection.
 db.prepare('UPDATE media SET hidden=0 WHERE id=?').run(original.id);db.close();
 await stop();base=await start();assert.equal((await request('/api/affiliate/sources')).count,1);
 assert.equal((await request('/api/shopee/export/location',{})).path,exportFile);
 child.send({type:'shopee-state',state:{running:true,affiliateExcelPath:exportFile}});
 for(let i=0;i<100;i++){if((await request('/api/shopee')).running)break;await new Promise(resolve=>setTimeout(resolve,10));}
 const busy=await fetch(base+'/api/shopee/export/location',{method:'POST'});assert.equal(busy.ok,false);assert.match((await busy.json()).error,/Đợi lượt tải/);
 child.send({type:'shopee-state',state:{running:false,affiliateExcelPath:exportFile}});
 for(let i=0;i<100;i++){if(!(await request('/api/shopee')).running)break;await new Promise(resolve=>setTimeout(resolve,10));}
 const restarted=await request('/api/state');assert.equal(restarted.media.length,0);assert.equal(restarted.jobs.length,0);
 const retained=new DatabaseSync(join(dir,'reels.sqlite'),{readOnly:true});
 const savedJob=retained.prepare('SELECT * FROM jobs WHERE id=?').get('retained-job');
 assert.equal(savedJob.media_id,original.id);assert.equal(savedJob.status,'remote_scheduled');assert.equal(savedJob.history_hidden,1);retained.close();
 assert.equal((await request('/api/state')).media.length,0);
 await request('/api/videos/import',{paths:[file]});
 assert.equal((await request('/api/state')).media[0].id,original.id);
 const mapping=await request('/api/affiliate/inspect',{name:'aff.csv',data:Buffer.from('Original URL,Affiliate\nhttps://shopee.vn/product/1/2,https://s.shopee.vn/abc\n').toString('base64')});
 const input={mapping:{id:mapping.id,...mapping.suggestion}};
 assert.equal((await request('/api/affiliate/merge',input)).added,1);
 assert.equal((await request('/api/affiliate/merge',input)).duplicates,1);
 const state=await request('/api/state');assert.equal(state.media.length,1);assert.equal(state.media[0].affiliate_caption,productName.trim()+'\nhttps://s.shopee.vn/abc');
 child.send({type:'shopee-file',path:file,url:'https://shopee.vn/product/1/2',name:'product.mp4',productName,reused:true});
 await new Promise(r=>setTimeout(r,100));assert.equal((await request('/api/state')).media.length,1);
 console.log('Shopee auto-import, export folder discovery/reveal/persistence, automatic merge, caption and reuse checks passed');
}finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
