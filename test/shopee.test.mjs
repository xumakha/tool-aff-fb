import {test} from 'node:test';
import assert from 'node:assert/strict';
import helpers from '../desktop/shopee-url.cjs';
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
 assert.ok(Array.from(filename('á'.repeat(200))).length<=100);
});
test('video host validation uses DNS boundaries',()=>{
 assert.ok(videoURL('https://down-vn.vod.susercontent.com/video.mp4'));
 for(const u of ['https://susercontent.com.evil.test/a','http://susercontent.com/a','https://127.0.0.1/a','file:///etc/passwd','https://user@susercontent.com/a'])assert.equal(videoURL(u),false);
});
