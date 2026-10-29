import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rename,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import helpers from '../desktop/shopee-downloads.cjs';
const {productIdentity,collectProducts,loadHistory,saveHistory,existingDownload}=helpers;
test('same product with slug, tracking, leading zeros or canonical URL is scanned once',()=>{
 const products=new Map();collectProducts(products,[{url:'https://shopee.vn/ao-do-i.01.002?from=shop',marked:true},{url:'https://shopee.vn/product/1/2',marked:false},{url:'https://shopee.vn/ao-moi-i.1.2?x=3',marked:false}]);assert.equal(products.size,1);assert.deepEqual([...products.values()],[{id:'1:2',url:'https://shopee.vn/product/1/2',marked:true,xtra:false}]);collectProducts(products,[{url:'https://shopee.vn/product/1/3',marked:false}]);assert.equal(products.size,2);
 for(const url of ['https://evil.test/product/1/2','https://shopee.vn/shop','https://shopee.vn/product/1/2/other','https://shopee.vn/product/1.2','http://shopee.vn/product/1/2'])assert.equal(productIdentity(url),null);
});
test('history survives restart and recognizes files moved to video đã đăng',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'shopee-history-'));try{const history=await loadHistory(folder);const file=join(folder,'Áo đẹp.mp4');const bytes=Buffer.alloc(24);bytes.write('ftyp',4);await writeFile(file,bytes);const info=await stat(file);history.items['1:2']={name:'Áo đẹp.mp4',size:info.size,mtime:info.mtimeMs};await saveHistory(folder,history);const reloaded=await loadHistory(folder);assert.deepEqual(reloaded,history);assert.equal(await existingDownload(folder,reloaded.items['1:2']),file);
 await mkdir(join(folder,'video đã đăng'));const moved=join(folder,'video đã đăng','Áo đẹp.mp4');await rename(file,moved);assert.equal(await existingDownload(folder,reloaded.items['1:2']),moved);
 await writeFile(moved,Buffer.concat([bytes,Buffer.from('changed')]));assert.equal(await existingDownload(folder,reloaded.items['1:2']),null);assert.equal(await existingDownload(folder,{name:'../outside.mp4',size:24,mtime:0}),null);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('missing file is eligible for download; damaged history is reported instead of silently duplicating',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'shopee-history-'));try{assert.equal(await existingDownload(folder,{name:'missing.mp4',size:24,mtime:0}),null);assert.equal(await existingDownload(folder,undefined),null);await writeFile(join(folder,'.shopee-downloads.json'),'broken');await assert.rejects(()=>loadHistory(folder),/Không đọc được lịch sử/);assert.equal(await readFile(join(folder,'.shopee-downloads.json'),'utf8'),'broken');}finally{await rm(folder,{recursive:true,force:true});}
});
