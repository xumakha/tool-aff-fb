import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createCipheriv} from 'node:crypto';

test('30 remote schedules reach 100 only after Meta confirms each SCHEDULED',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'reels-remote-'));
 const data=join(temp,'data'),folder=join(temp,'videos'),log=join(temp,'meta.log');
 await mkdir(folder);const bytes=Buffer.alloc(24);bytes.write('ftyp',4);
 const files=Array.from({length:30},(_,i)=>join(folder,`video-${i+1}.mp4`));for(const file of files)await writeFile(file,bytes);
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const payload=Buffer.concat([cipher.update('page-token'),cipher.final()]);
 const token=[iv,cipher.getAuthTag(),payload].map(x=>x.toString('hex')).join('.');
 const child=spawn(process.execPath,['--import',pathToFileURL(resolve('test/mock-remote-meta.mjs')).href,resolve('server.mjs')],{cwd:resolve('.'),env:{...process.env,DATA_DIR:data,PORT:'0',HOST:'127.0.0.1',APP_URL:'http://localhost:3000',ADMIN_PASSWORD:'',META_APP_ID:'test',META_APP_SECRET:'test',META_GRAPH_VERSION:'v99.0',TOKEN_ENCRYPTION_KEY:key.toString('hex'),MOCK_META_LOG:log},stdio:['ignore','pipe','pipe']});
 let db,stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 try{
  let output='';const port=await new Promise((resolvePort,reject)=>{const timeout=setTimeout(()=>reject(Error('Startup timeout: '+output+' '+stderr)),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/listening on port (\d+)/);if(match){clearTimeout(timeout);resolvePort(match[1]);}});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Worker exited: '+code+' '+stderr));});});
  const base=`http://127.0.0.1:${port}`;
  db=new DatabaseSync(join(data,'reels.sqlite'));db.prepare('INSERT INTO pages VALUES(?,?,?)').run('page','Page',token);
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('/api/videos/import',{paths:files})).status,200);
  const media=(await (await fetch(base+'/api/state')).json()).media;
  const due='2099-01-01T01:00:00.000Z';
  const response=await post('/api/jobs/batch',{pageId:'page',items:media.map(m=>({mediaId:m.id,caption:'Test',due})),remote:true});
  assert.equal(response.status,201);const {batchId}=await response.json();
  let jobs;for(let i=0;i<200;i++){jobs=(await (await fetch(base+'/api/state')).json()).jobs.filter(x=>x.batch_id===batchId);if(jobs.length===30 && jobs.every(j=>j.status==='remote_scheduled'))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(jobs?.length,30);assert.ok(jobs.every(j=>j.status==='remote_scheduled' && j.progress===100),JSON.stringify(jobs.filter(j=>j.status!=='remote_scheduled').map(j=>({status:j.status,error:j.error}))));
  const meta=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(meta.length,30);assert.ok(meta.every(m=>m.state==='SCHEDULED' && m.due===String(Date.parse(due)/1000)));
  assert.equal((await (await fetch(base+'/api/state')).json()).media.length,0);
  for(const file of files){await assert.rejects(()=>readFile(file),{code:'ENOENT'});assert.deepEqual(await readFile(join(folder,'video đã đăng',basename(file))),bytes);}
  for(const row of db.prepare('SELECT * FROM media').all()){assert.ok(row.path.includes('video đã đăng'));assert.deepEqual(await readFile(row.path),bytes);}
 }finally{db?.close();if(child.exitCode===null && !child.killed){const ended=once(child,'exit');child.kill();await ended;}await rm(temp,{recursive:true,force:true});}
});
