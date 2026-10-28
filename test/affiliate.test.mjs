import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {inspectFile,mergeAffiliate,productKey,appendAffiliate} from '../affiliate.mjs';
import excel from '../desktop/shopee-excel.cjs';
test('matches Shopee product identities without trusting title or tracking query',()=>{
 assert.equal(productKey('https://shopee.vn/Áo-đẹp-i.00123.456?x=2'),'123:456');assert.equal(productKey('https://shopee.vn/product/123/456'),'123:456');
 for(const link of ['https://evil.test/product/123/456','https://s.shopee.vn/abc','https://shopee.vn/ten-shop','https://shopee.vn/product/123/4567/extra'])assert.equal(productKey(link),null);
});
test('joins reordered rows by product ID, preserves names/sheets and flags ambiguous or missing links',async()=>{
 const video=await inspectFile({name:'video.xlsx',data:(await excel.workbook([{url:'https://shopee.vn/ao-i.1.22?track=abc',name:'Áo đẹp (2).mp4'},{url:'https://shopee.vn/product/1/33',name:'B.mp4'},{url:'https://shopee.vn/product/1/44',name:'C.mp4'},{url:'https://s.shopee.vn/original',name:'D.mp4'}])).toString('base64')});
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Shopee');sheet.addRow(['Thông tin xuất']);sheet.addRow(['Aff','Original']);sheet.addRow(['https://s.shopee.vn/B','https://shopee.vn/product/1/33']);sheet.addRow([{text:'Mở affiliate',hyperlink:'https://s.shopee.vn/A'},'https://shopee.vn/product/1/22']);sheet.addRow(['https://s.shopee.vn/A','https://shopee.vn/ao-i.1.22']);sheet.addRow(['https://s.shopee.vn/B2','https://shopee.vn/product/1/33']);sheet.addRow(['javascript:alert(1)','https://shopee.vn/product/1/44']);
 const mapping=await inspectFile({name:'Shopee.xlsx',data:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')});
 const input={video:{id:video.id,sheet:video.sheets[0].id,header:1,urlColumn:1},mapping:{id:mapping.id,sheet:mapping.sheets[0].id,header:2,urlColumn:2,affiliateColumn:1}};
 const result=await mergeAffiliate(input);assert.deepEqual(result.stats,{matched:1,unmatched:1,conflicts:1,invalid:1,invalidMapping:1});assert.equal(result.rows.length,1);assert.deepEqual(result.rows[0],['https://shopee.vn/ao-i.1.22?track=abc','','','','','','Áo đẹp (2).mp4','https://s.shopee.vn/A']);
 const again=await mergeAffiliate(input);assert.deepEqual(again,result);

});
test('CSV mapping supports quoted fields, semicolon delimiter, Vietnamese and preserves additional sheets',async()=>{
 const book=new ExcelJS.Workbook();const rows=book.addWorksheet('Video');rows.addRow(['Link sản phẩm','Tên sản phẩm']);rows.addRow(['https://shopee.vn/product/1/2','Áo, đẹp.mp4']);book.addWorksheet('Ghi chú').getCell('A1').value='Giữ nguyên';
 const video=await inspectFile({name:'v.xlsx',data:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')});
 const mapping=await inspectFile({name:'Shopee.csv',data:Buffer.from('Link gốc;Link aff\n"https://shopee.vn/t-i.1.2";"https://s.shopee.vn/abc?x=1&y=2"\n').toString('base64')});
 const input={video:{id:video.id,sheet:video.sheets[0].id,header:1,urlColumn:1},mapping:{id:mapping.id,sheet:mapping.sheets[0].id,header:1,urlColumn:1,affiliateColumn:2}};
 const result=await mergeAffiliate(input);assert.equal(result.stats.matched,1);assert.equal(result.rows[0][6],'Áo, đẹp.mp4');
 const {mkdtemp,readdir,rm,readFile,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'affiliate-master-'));
 try{const file=join(dir,'Tổng hợp.xlsx');const master=new ExcelJS.Workbook();master.addWorksheet('Ghi chú').getCell('A1').value='Giữ nguyên';await master.xlsx.writeFile(file);
 const first=await appendAffiliate(file,input);assert.equal(first.added,1);assert.equal(first.duplicates,0);const second=await appendAffiliate(file,input);assert.equal(second.added,0);assert.equal(second.duplicates,1);
 const saved=new ExcelJS.Workbook();await saved.xlsx.readFile(file);assert.equal(saved.getWorksheet('Ghi chú').getCell('A1').value,'Giữ nguyên');const rows=saved.getWorksheet('sheet 1');assert.equal(rows.rowCount,2);assert.deepEqual(rows.getRow(1).values.slice(1),['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung']);assert.equal(rows.getCell('B2').value,'Áo, đẹp.mp4');assert.equal(rows.getCell('C2').value,'https://s.shopee.vn/abc?x=1&y=2');assert.equal(rows.columnCount,4);assert.equal(rows.getCell('D2').value,'Áo, đẹp.mp4\nhttps://s.shopee.vn/abc?x=1&y=2');assert.equal(rows.getCell('D2').alignment.wrapText,true);assert.deepEqual(await readdir(dir),['Tổng hợp.xlsx']);
 const broken=join(dir,'Sai.xlsx');const bad=new ExcelJS.Workbook();bad.addWorksheet('sheet 1').addRow(['Sai tiêu đề']);await bad.xlsx.writeFile(broken);const before=await readFile(broken);await assert.rejects(()=>appendAffiliate(broken,input),/đúng tiêu đề/);assert.deepEqual(await readFile(broken),before);
 }finally{await rm(dir,{recursive:true,force:true});}

});

test('new export preserves Sub IDs and appends subsequent batches into the same master',async()=>{
 const video=await inspectFile({name:'video.xlsx',data:(await excel.workbook([{url:'https://shopee.vn/product/8/9',sub_id1:'001',sub_id5:'chiến dịch',name:'A.mp4'},{url:'https://shopee.vn/product/8/10',name:'B.mp4'}])).toString('base64')});
 const map=await inspectFile({name:'aff.csv',data:Buffer.from('Liên kết gốc,Link aff\nhttps://shopee.vn/product/8/9,https://s.shopee.vn/first\nhttps://shopee.vn/product/8/10,https://s.shopee.vn/second\n').toString('base64')});
 const input={video:{id:video.id,sheet:video.sheets[0].id,header:1,urlColumn:1},mapping:{id:map.id,sheet:map.sheets[0].id,header:1,urlColumn:1,affiliateColumn:2}};const merged=await mergeAffiliate(input);assert.equal(merged.rows[0][1],'001');assert.equal(merged.rows[0][5],'chiến dịch');assert.equal(merged.rows[0][6],'A.mp4');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'affiliate-batches-'));try{const file=join(dir,'master.xlsx');const book=new ExcelJS.Workbook();book.addWorksheet('Notes');await book.xlsx.writeFile(file);assert.equal((await appendAffiliate(file,input)).added,2);const output=new ExcelJS.Workbook();await output.xlsx.readFile(file);output.getWorksheet('sheet 1').addRow(['https://shopee.vn/product/99/99','Old.mp4','https://s.shopee.vn/old','Old.mp4\nhttps://s.shopee.vn/old']);await output.xlsx.writeFile(file);assert.equal((await appendAffiliate(file,input)).duplicates,2);const final=new ExcelJS.Workbook();await final.xlsx.readFile(file);assert.equal(final.getWorksheet('sheet 1').rowCount,4);assert.equal(final.getWorksheet('sheet 1').getCell('B4').value,'Old.mp4');}finally{await rm(dir,{recursive:true,force:true});}
});
