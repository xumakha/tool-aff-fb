import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,mkdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {inspectVideo,selectVideos,checkUnchanged} from '../local-media.mjs';
import {stageScheduledMedia,rollbackScheduledMedia,finishScheduledMedia} from '../scheduled-media.mjs';
const bytes=Buffer.from('0000ftypisom000000000000');
async function fixture(run){const dir=realpathSync(mkdtempSync(join(tmpdir(),'reels-move-'))),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE media(id TEXT,path TEXT,name TEXT,size INTEGER,mtime REAL,folder TEXT)');const add=async(id,folder,name='Áo đẹp.mp4')=>{mkdirSync(folder,{recursive:true});const file=join(folder,name);writeFileSync(file,bytes);const info=await inspectVideo(file);db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?)').run(id,info.path,info.name,info.size,info.mtime,folder);return file;};try{await run({dir,db,add});}finally{db.close();rmSync(dir,{recursive:true,force:true});}}
test('selection creates empty archive; scheduling preserves bytes/name and updates paths across folders',()=>fixture(async({dir,db,add})=>{
 const a=await add('a',join(dir,'one')),b=await add('b',join(dir,'two'));await selectVideos([a,b]);assert.ok(existsSync(join(dir,'one','video đã đăng')));assert.ok(existsSync(a));
 db.exec('BEGIN');const staged=stageScheduledMedia(db,['a','b']);db.exec('COMMIT');assert.deepEqual(finishScheduledMedia(staged),[]);
 for(const [id,old]of [['a',a],['b',b]]){const row=db.prepare('SELECT * FROM media WHERE id=?').get(id);assert.ok(!existsSync(old));assert.deepEqual(readFileSync(row.path),bytes);assert.equal(row.name,'Áo đẹp.mp4');await checkUnchanged(row);}
 assert.deepEqual(stageScheduledMedia(db,['a','b']),[]);assert.ok(!existsSync(join(dir,'one','video đã đăng','video đã đăng')));
}));
test('destination collision rolls back earlier copies, keeps originals and never overwrites',()=>fixture(async({dir,db,add})=>{
 const a=await add('a',dir,'a.mp4'),b=await add('b',dir,'b.mp4');mkdirSync(join(dir,'video đã đăng'));const collision=join(dir,'video đã đăng','b.mp4');writeFileSync(collision,'existing');
 db.exec('BEGIN');assert.throws(()=>stageScheduledMedia(db,['a','b']),/cùng tên/);db.exec('ROLLBACK');assert.ok(existsSync(a));assert.ok(existsSync(b));assert.ok(!existsSync(join(dir,'video đã đăng','a.mp4')));assert.equal(readFileSync(collision,'utf8'),'existing');assert.equal(db.prepare('SELECT path FROM media WHERE id=?').get('a').path,a);
}));
test('database failure rollback preserves sources and original paths',()=>fixture(async({dir,db,add})=>{
 const file=await add('a',dir);db.exec('BEGIN');const staged=stageScheduledMedia(db,['a']);db.exec('ROLLBACK');rollbackScheduledMedia(staged);assert.ok(existsSync(file));assert.ok(!existsSync(staged[0].target));await checkUnchanged(db.prepare('SELECT * FROM media').get());
}));
