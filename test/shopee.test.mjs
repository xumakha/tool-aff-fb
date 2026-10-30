import {test} from 'node:test';
import assert from 'node:assert/strict';
import helpers from '../desktop/shopee-url.cjs';
import path from 'node:path';
import {mkdtemp,writeFile,mkdir,rename,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const {shopURL,filename,videoURL}=helpers;
test('shop folders combine readable shop name and clean URL without tracking query',()=>{
 assert.equal(helpers.shopFolderName('Kim khí A&T','https://shopee.vn/kim-khi-a&t?tracking=123'),'kim-khi-a&t-shopee.vn-kim-khi-a&t');
 assert.equal(helpers.shopFolderName('','https://shopee.vn/my_shop/'),'my_shop-shopee.vn-my_shop');
 assert.ok(!/[<>:"/\\|?*]/.test(helpers.shopFolderName('A: B / C','https://shopee.vn/shop')));
});
test('shop URLs restricted to Shopee HTTPS shop pages',()=>{
 assert.equal(shopURL('https://shopee.vn/ipone_vietnam?categoryId=100636'),'https://shopee.vn/ipone_vietnam?categoryId=100636');
 for(const u of ['http://shopee.vn/shop','https://evil.test/shop','https://shopee.vn@evil.test/shop','https://shopee.vn/product/1/2','https://shopee.vn:444/shop'])assert.throws(()=>shopURL(u));
});
test('Unicode filenames safe on Windows',()=>{
 assert.equal(filename('Áo đẹp / mới: 2026?'),'Áo đẹp mới 2026');
 assert.equal(filename('CON'),'_CON');assert.equal(filename('...'),'Video');
 assert.equal(filename('á'.repeat(200)),'á'.repeat(200));
});

test('long product filenames use the folder budget and leave room for archive and collision suffix',()=>{
 const title='Máy giặt mini gấp gọn '.repeat(25),folder=path.resolve('test-video-folder');
 const name=filename(title,folder);assert.ok(name.length>100);assert.ok(name.length+' (10000).mp4'.length<=255);
 assert.ok(path.join(folder,'video đã đăng',name+' (10000).mp4').length<=259);
 const emoji=filename('😀'.repeat(300),folder);assert.equal(emoji.includes('\uFFFD'),false);assert.ok(!/[\uD800-\uDBFF]$/.test(emoji));
 assert.ok(!/[. ]$/.test(filename(('word. ').repeat(100),folder)));
 assert.throws(()=>filename(title,path.resolve('x'.repeat(255))),/quá dài/);
});

test('long Unicode filenames can be saved and moved into the scheduling archive',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'shopee-long-name-'));
 try{
  const name=filename(('Đèn ngủ thông minh 😀 cho phòng khách ').repeat(12),folder)+' (10000).mp4';
  assert.ok(name.length>100);const file=path.join(folder,name),archive=path.join(folder,'video đã đăng');
  await writeFile(file,'unchanged-video');await mkdir(archive);await rename(file,path.join(archive,name));
  assert.equal(await readFile(path.join(archive,name),'utf8'),'unchanged-video');
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('video host validation uses DNS boundaries',()=>{
 assert.ok(videoURL('https://down-vn.vod.susercontent.com/video.mp4'));
 for(const u of ['https://susercontent.com.evil.test/a','http://susercontent.com/a','https://127.0.0.1/a','file:///etc/passwd','https://user@susercontent.com/a'])assert.equal(videoURL(u),false);
});
