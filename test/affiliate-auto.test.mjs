import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectFile,suggestMapping,mergeAffiliate} from '../affiliate.mjs';

test('detects mapping across sheets and title rows, rejects ambiguous headers',async()=>{
 const file=await inspectFile({name:'aff.csv',data:Buffer.from('Report,,\nLink affiliate,Original URL,Note\nhttps://s.shopee.vn/abc,https://shopee.vn/product/1/2,ok\n').toString('base64')});
 const guess=suggestMapping(file.sheets);assert.deepEqual(guess,{sheet:file.sheets[0].id,header:2,urlColumn:2,affiliateColumn:1});
 assert.equal(suggestMapping([...file.sheets,...file.sheets.map(s=>({...s,id:99}))]),null);
 assert.equal(suggestMapping([{id:1,preview:[['Original URL','Affiliate','Affiliate'],['https://shopee.vn/product/1/2','https://s.shopee.vn/a','https://s.shopee.vn/b']]}]),null);
 const result=await mergeAffiliate({mapping:{id:file.id,...guess}},[{url:'https://shopee.vn/ao-i.1.2',name:'Áo.mp4'},{url:'https://shopee.vn/product/1/3',name:'Other.mp4'}]);
 assert.equal(result.stats.matched,1);assert.equal(result.stats.unmatched,1);assert.equal(result.rows[0][6],'Áo.mp4');assert.equal(result.rows[0][7],'https://s.shopee.vn/abc');
});
