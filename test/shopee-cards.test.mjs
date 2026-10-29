import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import cards from '../desktop/shopee-cards.cjs';
import downloads from '../desktop/shopee-downloads.cjs';
test('recognizes supplied Xtra image in src, responsive sources and lazy attributes only within its card',()=>{
 const badge='https://down-vn.img.susercontent.com/file/vn-11134258-7r98o-lym830xtkwipb8';
 for(const attr of ['src','srcset','data-src','data-srcset']){
  const anchors=[badge+'@resize_w71_nl.webp 1x, '+badge+'@resize_w142_nl.webp 2x','https://down-vn.img.susercontent.com/file/another-promotion'].map((value,i)=>({
   href:`https://shopee.vn/product/1/${i+1}`,closest:()=>({querySelector:()=>null,querySelectorAll:()=>[{getAttribute:key=>key===attr?value:null}]})
  }));
  const result=vm.runInNewContext(cards.cardsScript,{URL,location:{href:'https://shopee.vn/shop'},document:{querySelectorAll:()=>anchors}});
  assert.equal(result[0].xtra,true);assert.equal(result[1].xtra,false);
 }
});
test('Xtra survives repeat scans and takes priority while retaining every product and stable group order',()=>{
 const products=new Map();
 downloads.collectProducts(products,[1,2,3,4].map(id=>({url:`https://shopee.vn/product/1/${id}`,xtra:id===3})));
 downloads.collectProducts(products,[{url:'https://shopee.vn/product/1/2',xtra:true},{url:'https://shopee.vn/product/1/3',xtra:false}]);
 assert.deepEqual(cards.prioritizeProducts(products).map(p=>p.id),['1:2','1:3','1:1','1:4']);
 assert.deepEqual([...products.keys()],['1:1','1:2','1:3','1:4']);
});
