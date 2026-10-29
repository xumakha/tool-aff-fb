import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('clear history hides confirmed schedules without deleting jobs or active work',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'job-history-'));let child,db;
 try{
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:''},stdio:['ignore','ignore','pipe','ipc']});
  const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m);}});});
  const base=`http://127.0.0.1:${ready.port}`;
  db=new DatabaseSync(join(folder,'reels.sqlite'));
  const statuses=['published','cancelled','remote_scheduled','queued','running','processing','review','remote_queued','remote_uploading','remote_confirming'];
  statuses.forEach((status,i)=>db.prepare('INSERT INTO jobs(id,page_id,media_id,due,created,status) VALUES(?,?,?,?,?,?)').run(String(i),'page','media','2099-01-01','2026-01-01',status));
  const response=await fetch(base+'/api/jobs/history',{method:'DELETE'});assert.equal(response.status,200);assert.equal((await response.json()).count,3);
  const state=await (await fetch(base+'/api/state')).json();assert.deepEqual(state.jobs.map(j=>j.status).sort(),statuses.slice(3).sort());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,10);
  assert.equal(db.prepare("SELECT status FROM jobs WHERE status='remote_scheduled'").get().status,'remote_scheduled');
  assert.equal((await (await fetch(base+'/api/jobs/history',{method:'DELETE'})).json()).count,0);
 }finally{db?.close();if(child){const exited=once(child,'exit');child.kill();await exited;}await rm(folder,{recursive:true,force:true});}
});
