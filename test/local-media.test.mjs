import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanFolder, checkUnchanged} from '../local-media.mjs';
const video=()=>{const b=Buffer.alloc(24);b.write('ftyp',4);b.write('isom',8);return b;};
test('scans unicode folder without copying files, excludes nested and invalid files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'reels-local-'));try{
 const path=join(dir,'Việt Nam video.MP4');await writeFile(path,video());await writeFile(join(dir,'bad.mp4'),'bad');await writeFile(join(dir,'ignore.txt'),'text');await mkdir(join(dir,'nested'));await writeFile(join(dir,'nested','nested.mp4'),video());
 const result=await scanFolder(dir);assert.equal(result.files.length,1);assert.equal(result.skipped.length,1);assert.equal(result.files[0].name,'Việt Nam video.MP4');assert.deepEqual(await readFile(path),video());await checkUnchanged(result.files[0]);
 await writeFile(path,Buffer.concat([video(),Buffer.from('changed')]));await assert.rejects(()=>checkUnchanged(result.files[0]),/đã thay đổi/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('missing or renamed original gives actionable error',async()=>{const dir=await mkdtemp(join(tmpdir(),'reels-missing-'));try{const path=join(dir,'test.mov');await writeFile(path,video());const {files}=await scanFolder(dir);await rename(path,join(dir,'renamed.mov'));await assert.rejects(()=>checkUnchanged(files[0]),/di chuyển/);}finally{await rm(dir,{recursive:true,force:true});}});
test('requires an absolute folder path',async()=>{await assert.rejects(()=>scanFolder('relative/path'),/tuyệt đối/);});
