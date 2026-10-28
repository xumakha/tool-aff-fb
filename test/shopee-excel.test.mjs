import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import excel from '../desktop/shopee-excel.cjs';
const load=async bytes=>{const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);return book;};
test('export uses supplied Shopee template sheet, exact headers/styles and extra video name column',async()=>{
 const template=await load(await readFile(new URL('../desktop/templates/shopee-batch-custom-links.xlsx',import.meta.url)));
 const book=await load(await excel.workbook([{url:'https://shopee.vn/product/1/2?a=1&b=2',name:'Áo đẹp (2).mp4',sub_id1:'001'},{url:'https://shopee.vn/product/1/3',name:'=SUM(1).mp4'}]));
 assert.deepEqual(book.worksheets.map(s=>s.name),template.worksheets.map(s=>s.name));const sheet=book.getWorksheet('Sheet1'),original=template.getWorksheet('Sheet1');assert.equal(sheet.columnCount,7);assert.equal(sheet.rowCount,3);
 for(let col=1;col<=6;col++){assert.equal(sheet.getRow(1).getCell(col).value,original.getRow(1).getCell(col).value);assert.deepEqual(sheet.getRow(1).getCell(col).style,original.getRow(1).getCell(col).style);}
 assert.deepEqual(sheet.views,original.views);assert.deepEqual(sheet.model.merges,original.model.merges);assert.equal(sheet.getCell('G1').value,'Tên sản phẩm');assert.equal(sheet.getCell('G2').value,'Áo đẹp (2).mp4');assert.equal(sheet.getCell('A2').value,'https://shopee.vn/product/1/2?a=1&b=2');assert.equal(sheet.getCell('B2').value,'001');assert.equal(sheet.getCell('G3').value,'=SUM(1).mp4');assert.equal(sheet.getCell('G3').type,ExcelJS.ValueType.String);
 for(const col of ['C','D','E','F'])assert.ok(!sheet.getCell(col+'2').value);assert.equal(original.columnCount,6);assert.equal(original.rowCount,1);
});
test('checkpoint replaces workbook from template and removes temporary files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shopee-excel-'));try{const file=join(dir,'Danh sách.xlsx');await excel.saveWorkbook(file,[]);const empty=await load(await readFile(file));assert.equal(empty.getWorksheet('Sheet1').rowCount,1);
 await excel.saveWorkbook(file,[{url:'https://shopee.vn/product/1/2',name:'Video.mp4'}]);const book=await load(await readFile(file));assert.equal(book.getWorksheet('Sheet1').getCell('G2').value,'Video.mp4');assert.deepEqual(await readdir(dir),['Danh sách.xlsx']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
