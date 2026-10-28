import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,realpath,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {previewDuplicates,deleteDuplicates} from '../duplicate-videos.mjs';
async function fixture(run){const dir=await realpath(await mkdtemp(join(tmpdir(),'reels-dupes-'))),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE media(id TEXT,path TEXT);CREATE TABLE jobs(id TEXT,media_id TEXT)');try{await run(dir,db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
test('only exact content copies with numbered suffixes are removed; original and different videos survive',()=>fixture(async(dir,db)=>{
 const a=join(dir,'Áo.mp4'),b=join(dir,'Áo (1).mp4'),c=join(dir,'Áo (2).mp4'),d=join(dir,'Áo (3).mp4');for(const file of [a,b,c])await writeFile(file,'same video');await writeFile(d,'different video');await writeFile(join(dir,'Only (1).mp4'),'standalone');await writeFile(join(dir,'Other.mp4'),'same video');db.prepare('INSERT INTO media VALUES(?,?)').run('duplicate',b);
 const preview=await previewDuplicates(dir,db);assert.equal(preview.candidates.length,2);assert.ok(preview.candidates.every(f=>f.keep===a));const deleted=await deleteDuplicates(preview.id,preview.candidates.map(f=>f.id),db);assert.equal(deleted.deleted.length,2);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media').get().n,0);assert.equal(await readFile(a,'utf8'),'same video');assert.equal(await readFile(d,'utf8'),'different video');await assert.rejects(()=>readFile(b),{code:'ENOENT'});await assert.rejects(()=>deleteDuplicates(preview.id,[preview.candidates[0].id],db),/hết hạn/);
}));
test('keeps one numbered file when no base exists and scans subfolders',()=>fixture(async(dir,db)=>{
 await mkdir(join(dir,'video đã đăng'));const keep=join(dir,'Video (1).mov'),copy=join(dir,'video đã đăng','Video (2).mov');await writeFile(keep,'same');await writeFile(copy,'same');const preview=await previewDuplicates(dir,db);assert.equal(preview.candidates.length,1);assert.equal(preview.candidates[0].keep,keep);const result=await deleteDuplicates(preview.id,[preview.candidates[0].id],db);assert.deepEqual(result.deleted,[copy]);assert.equal(await readFile(keep,'utf8'),'same');
}));
test('scheduled files and files scheduled after preview are protected',()=>fixture(async(dir,db)=>{
 const base=join(dir,'A.mp4'),copy=join(dir,'A (1).mp4');await writeFile(base,'same');await writeFile(copy,'same');const preview=await previewDuplicates(dir,db);db.prepare('INSERT INTO media VALUES(?,?)').run('scheduled',copy);db.prepare('INSERT INTO jobs VALUES(?,?)').run('job','scheduled');const result=await deleteDuplicates(preview.id,[preview.candidates[0].id],db);assert.equal(result.deleted.length,0);assert.equal(result.skipped.length,1);assert.equal(await readFile(copy,'utf8'),'same');const again=await previewDuplicates(dir,db);assert.equal(again.candidates.length,0);assert.equal(again.skipped.length,1);
}));
test('changed or missing retained copy prevents deletion and arbitrary paths cannot be submitted',()=>fixture(async(dir,db)=>{
 const base=join(dir,'A.mp4'),copy=join(dir,'A (1).mp4');await writeFile(base,'same');await writeFile(copy,'same');const preview=await previewDuplicates(dir,db);await assert.rejects(()=>deleteDuplicates(preview.id,['../../outside.mp4'],db),/danh sách/);await writeFile(base,'changed');const result=await deleteDuplicates(preview.id,[preview.candidates[0].id],db);assert.equal(result.deleted.length,0);assert.equal(result.skipped.length,1);assert.equal(await readFile(copy,'utf8'),'same');await writeFile(base,'same');const again=await previewDuplicates(dir,db);await unlink(base);const missing=await deleteDuplicates(again.id,[again.candidates[0].id],db);assert.equal(missing.deleted.length,0);assert.equal(await readFile(copy,'utf8'),'same');
}));
