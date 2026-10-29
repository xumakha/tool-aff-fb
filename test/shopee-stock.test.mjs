import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import stock from '../desktop/shopee-stock.cjs';
function detect(items){
 const nodes=items.map(item=>({innerText:item.text,children:item.children?[{}]:[],getClientRects:()=>item.hidden?[]:[{}],closest:()=>item.excluded?{}:null,matches:()=>!!item.button,visibility:item.visibility||'visible'}));
 const root={querySelectorAll:()=>nodes};
 return vm.runInNewContext(stock.stockScript,{document:{querySelector:selector=>selector==='.product-briefing'?root:null},getComputedStyle:node=>({visibility:node.visibility})});
}
test('recognizes visible Vietnamese and English sold-out labels',()=>{
 for(const text of ['Hết hàng','ĐÃ HẾT HÀNG','Sản phẩm đã hết hàng',' Sold   out ','Out of stock'])assert.equal(detect([{text}]),true,text);
 assert.equal(detect([{text:'Sold out',children:true,button:true}]),true);
});
test('ignores sales counts, descriptions, unavailable variants and hidden labels',()=>{
 for(const item of [{text:'Đã bán 1k'},{text:'Sold 200'},{text:'Sắp hết hàng'},{text:'Áo Sold out bản mới'},{text:'Sold out',excluded:true},{text:'Hết hàng',hidden:true},{text:'Hết hàng',visibility:'hidden'},{text:'Sold out',children:true}])assert.equal(detect([item]),false,JSON.stringify(item));
 assert.equal(detect([]),false);
 assert.equal(vm.runInNewContext(stock.stockScript,{document:{querySelector:()=>null}}),false);
});
test('does not treat a sold-out recommendation elsewhere in main as the current product',()=>{
 const recommendation={querySelectorAll:()=>{throw Error('Must not inspect unrelated cards');}};
 assert.equal(vm.runInNewContext(stock.stockScript,{document:{querySelector:selector=>['main','[role="main"]'].includes(selector)?recommendation:null}}),false);
});
