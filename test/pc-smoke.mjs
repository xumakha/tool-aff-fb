// Run explicitly: node test/pc-smoke.mjs (requires local listening permission).
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const temp=await mkdtemp(join(tmpdir(),'reels-pc-smoke-')), folder=join(temp,'video space');
const {mkdir}=await import('node:fs/promises');await mkdir(folder);const file=join(folder,'test.mp4');const bytes=Buffer.alloc(24);bytes.write('ftyp',4);await writeFile(file,bytes);
const child=spawn(process.execPath,[process.env.SMOKE_SERVER_ENTRY || 'server.mjs'],{env:{...process.env,DATA_DIR:join(temp,'data'),PORT:'0',HOST:'127.0.0.1',APP_URL:'http://localhost:3000',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
let db;try{
 let text='';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Startup timeout')),10000);child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Server exited ${code}`));});child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('listening')){clearTimeout(timeout);resolve();}});});
 const port=text.match(/port (\d+)/)[1];const base=`http://127.0.0.1:${port}`;
 const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await fetch(base)).status,200);
 const added=await (await post('/api/folders/import',{path:folder})).json();assert.equal(added.added,1);
 const repeated=await (await post('/api/folders/import',{path:folder})).json();assert.equal(repeated.existing,1);assert.equal(repeated.added,0);
 assert.deepEqual((await readdir(join(temp,'data'))).filter(x=>!x.startsWith('reels.sqlite')),[]);
 const state=await (await fetch(base+'/api/state')).json();assert.equal(state.media[0].path,file);assert.equal(state.media.length,1);
 db=new DatabaseSync(join(temp,'data','reels.sqlite'));db.prepare('INSERT INTO pages VALUES(?,?,?)').run('test-page','Test','no-real-token');
 const job={pageId:'test-page',mediaId:state.media[0].id,caption:'test',due:'2099-01-01T00:00:00Z'};assert.equal((await post('/api/jobs',job)).status,201);
 const id=db.prepare('SELECT id FROM jobs').get().id;assert.equal((await fetch(base+'/api/jobs/'+id,{method:'DELETE'})).status,200);
 await writeFile(file,Buffer.concat([bytes,Buffer.from('changed')]));assert.equal((await post('/api/jobs',job)).status,400);
 const updated=await (await post('/api/folders/import',{path:folder})).json();assert.equal(updated.added,1);
 assert.equal((await fetch(base+'/api/folders/import',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
 console.log('PASS: PC startup, folder scan, repeat import, zero video copies, local path persistence, scheduling/cancel, changed-file protection, reimport, origin guard.');
}finally{db?.close();const exit=once(child,'exit');child.kill();await exit;await rm(temp,{recursive:true,force:true});}
