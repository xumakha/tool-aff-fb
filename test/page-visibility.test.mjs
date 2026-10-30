import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';

test('Page visibility persists, survives reconnection, protects new actions and retains tokens/jobs',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'page-visibility-'));let child,db,base;
 async function start(){
  child=spawn(process.execPath,[resolve('server.mjs')],{env:{...process.env,DATA_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:''},stdio:['ignore','ignore','pipe','ipc']});
  const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);child.once('error',reject);child.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}});});base=`http://127.0.0.1:${ready.port}`;
 }
 async function stop(){const exited=once(child,'exit');child.kill();await exited;child=null;}
 const post=(url,input)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const state=async()=>{const data=await(await fetch(base+'/api/state')).json();assert.ok(!JSON.stringify(data).includes('private-token'));return data;};
 try{
  await start();db=new DatabaseSync(join(folder,'reels.sqlite'));
  db.prepare('INSERT INTO pages VALUES(?,?,?)').run('1','Page A','private-token-A');db.prepare('INSERT INTO pages VALUES(?,?,?)').run('2','Page B','private-token-B');
  db.prepare('INSERT INTO jobs(id,page_id,due,created,status) VALUES(?,?,?,?,?)').run('keep-job','1','2099-01-01','2026-01-01','queued');
  assert.equal((await post('/api/pages/visibility',{pageId:'1',hidden:true})).status,200);
  let data=await state();assert.deepEqual(data.pages.map(page=>page.id),['2']);assert.deepEqual(data.hiddenPages.map(page=>page.id),['1']);assert.equal(data.jobs[0].id,'keep-job');
  assert.equal((await post('/api/jobs/batch',{pageId:'1',remote:false})).status,400);
  assert.equal((await post('/api/pages/visibility',{pageId:'1',hidden:'false'})).status,400);
  // OAuth uses an upsert; reconnecting must not silently unhide a Page.
  db.prepare('INSERT OR REPLACE INTO pages VALUES(?,?,?)').run('1','Page A renamed','private-token-new');
  assert.equal((await state()).hiddenPages[0].name,'Page A renamed');
  await stop();await start();data=await state();assert.deepEqual(data.pages.map(page=>page.id),['2']);assert.equal(data.hiddenPages[0].id,'1');
  assert.equal((await post('/api/pages/visibility',{pageId:'1',hidden:false})).status,200);data=await state();assert.equal(data.pages.length,2);assert.equal(data.hiddenPages.length,0);
  assert.equal(db.prepare('SELECT token FROM pages WHERE id=?').get('1').token,'private-token-new');assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get('keep-job').status,'queued');
 }finally{db?.close();if(child)await stop();await rm(folder,{recursive:true,force:true});}
});
