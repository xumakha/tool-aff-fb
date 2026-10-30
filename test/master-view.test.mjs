import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readMasterTable} from '../master-view.mjs';
test('read-only viewer searches Vietnamese, pages rows, preserves rich text and cached formulas without changing the file',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'master-view-')),file=join(folder,'Tong-hop-affiliate.xlsx');
 try{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('sheet 1');sheet.addRow(['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung']);
  sheet.addRow(['https://shopee.vn/product/1/2','Đèn ngủ đẹp','https://s.shopee.vn/abc','Đèn ngủ\nLink affiliate']);
  sheet.addRow(['', {richText:[{text:'Nồi '},{text:'cơm'}]},'',{formula:'1+1',result:2}]);
  for(let i=0;i<101;i++)sheet.addRow(['','Sản phẩm '+i,'','']);
  await book.xlsx.writeFile(file);const before=await readFile(file),info=await stat(file);
  const result=await readMasterTable(file,{q:'den dep'});assert.equal(result.matched,1);assert.equal(result.rows[0].row,2);assert.equal(result.rows[0].cells[3],'Đèn ngủ\nLink affiliate');
  assert.equal((await readMasterTable(file,{q:'NOI COM'})).rows[0].cells[3],'2');
  assert.equal((await readMasterTable(file,{q:'s.shopee.vn/abc'})).matched,1);
  const last=await readMasterTable(file,{page:999});assert.equal(last.total,103);assert.equal(last.page,2);assert.equal(last.rows.length,3);
  assert.equal((await readMasterTable(file,{q:'not found'})).rows.length,0);
  assert.deepEqual(await readFile(file),before);assert.equal((await stat(file)).mtimeMs,info.mtimeMs);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('missing workbook is never created by viewing',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'master-view-empty-')),file=join(folder,'missing.xlsx');
 try{await assert.rejects(readMasterTable(file),{code:'ENOENT'});await assert.rejects(stat(file),{code:'ENOENT'});}finally{await rm(folder,{recursive:true,force:true});}
});
