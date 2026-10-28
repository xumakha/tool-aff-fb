import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {inspectFile,mergeAffiliate,productKey} from '../affiliate.mjs';
import excel from '../desktop/shopee-excel.cjs';
test('matches Shopee product identities without trusting title or tracking query',()=>{
 assert.equal(productKey('https://shopee.vn/Áo-đẹp-i.00123.456?x=2'),'123:456');assert.equal(productKey('https://shopee.vn/product/123/456'),'123:456');
 for(const link of ['https://evil.test/product/123/456','https://s.shopee.vn/abc','https://shopee.vn/ten-shop','https://shopee.vn/product/123/4567/extra'])assert.equal(productKey(link),null);
});
test('joins reordered rows by product ID, preserves names/sheets and flags ambiguous or missing links',async()=>{
 const video=await inspectFile({name:'video.xlsx',data:excel.workbook([{url:'https://shopee.vn/ao-i.1.22?track=abc',name:'Áo đẹp (2).mp4'},{url:'https://shopee.vn/product/1/33',name:'B.mp4'},{url:'https://shopee.vn/product/1/44',name:'C.mp4'},{url:'https://s.shopee.vn/original',name:'D.mp4'}]).toString('base64')});
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Shopee');sheet.addRow(['Thông tin xuất']);sheet.addRow(['Aff','Original']);sheet.addRow(['https://s.shopee.vn/B','https://shopee.vn/product/1/33']);sheet.addRow([{text:'Mở affiliate',hyperlink:'https://s.shopee.vn/A'},'https://shopee.vn/product/1/22']);sheet.addRow(['https://s.shopee.vn/A','https://shopee.vn/ao-i.1.22']);sheet.addRow(['https://s.shopee.vn/B2','https://shopee.vn/product/1/33']);sheet.addRow(['javascript:alert(1)','https://shopee.vn/product/1/44']);
 const mapping=await inspectFile({name:'Shopee.xlsx',data:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')});
 const input={video:{id:video.id,sheet:video.sheets[0].id,header:1,urlColumn:1},mapping:{id:mapping.id,sheet:mapping.sheets[0].id,header:2,urlColumn:2,affiliateColumn:1}};
 const result=await mergeAffiliate(input);assert.deepEqual(result.stats,{matched:1,unmatched:1,conflicts:1,invalid:1,invalidMapping:1});assert.equal(result.name,'video-affiliate.xlsx');
 const output=new ExcelJS.Workbook();await output.xlsx.load(Buffer.from(result.data,'base64'));const rows=output.worksheets[0];assert.equal(rows.getCell('B2').value,'Áo đẹp (2).mp4');assert.equal(rows.getCell('C2').value,'https://s.shopee.vn/A');assert.equal(rows.getCell('C3').value,'');assert.match(rows.getCell('D3').value,/Nhiều link/);assert.equal(rows.getCell('B5').value,'D.mp4');
 const again=await mergeAffiliate(input);assert.deepEqual(again.stats,result.stats);const repeat=new ExcelJS.Workbook();await repeat.xlsx.load(Buffer.from(again.data,'base64'));assert.equal(repeat.worksheets[0].columnCount,4);
});
test('CSV mapping supports quoted fields, semicolon delimiter, Vietnamese and preserves additional sheets',async()=>{
 const book=new ExcelJS.Workbook();const rows=book.addWorksheet('Video');rows.addRow(['Link sản phẩm','Tên sản phẩm']);rows.addRow(['https://shopee.vn/product/1/2','Áo, đẹp.mp4']);book.addWorksheet('Ghi chú').getCell('A1').value='Giữ nguyên';
 const video=await inspectFile({name:'v.xlsx',data:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')});
 const mapping=await inspectFile({name:'Shopee.csv',data:Buffer.from('Link gốc;Link aff\n"https://shopee.vn/t-i.1.2";"https://s.shopee.vn/abc?x=1&y=2"\n').toString('base64')});
 const result=await mergeAffiliate({video:{id:video.id,sheet:video.sheets[0].id,header:1,urlColumn:1},mapping:{id:mapping.id,sheet:mapping.sheets[0].id,header:1,urlColumn:1,affiliateColumn:2}});
 assert.equal(result.stats.matched,1);const output=new ExcelJS.Workbook();await output.xlsx.load(Buffer.from(result.data,'base64'));assert.equal(output.getWorksheet('Ghi chú').getCell('A1').value,'Giữ nguyên');assert.equal(output.getWorksheet('Video').getCell('B2').value,'Áo, đẹp.mp4');
});
