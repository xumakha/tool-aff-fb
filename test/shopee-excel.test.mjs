import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import excel from '../desktop/shopee-excel.cjs';
function parts(buffer){const files=new Map();let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){const size=buffer.readUInt32LE(offset+18),nameSize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30;const name=buffer.toString('utf8',start,start+nameSize);const data=start+nameSize+extra;files.set(name,buffer.toString('utf8',data,data+size));offset=data+size;}assert.equal(buffer.readUInt32LE(offset),0x02014b50);assert.equal(buffer.readUInt32LE(buffer.length-22),0x06054b50);return files;}
test('Excel has seven text columns, exact downloaded names and escaped product URLs',()=>{
 const files=parts(excel.workbook([{url:'https://shopee.vn/product/1/2?a=1&b=2',name:'Áo đẹp (2).mp4'},{url:'https://shopee.vn/product/1/3',name:'=SUM(1).mp4'}]));
 assert.equal(files.size,5);const sheet=files.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/Liên kết gốc/);for(let i=1;i<=5;i++)assert.match(sheet,new RegExp('Sub_id'+i));assert.match(sheet,/Tên sản phẩm/);assert.match(sheet,/Áo đẹp \(2\).mp4/);assert.match(sheet,/a=1&amp;b=2/);
 assert.match(sheet,/<c r="G3" t="inlineStr"><is><t xml:space="preserve">=SUM\(1\).mp4/);assert.doesNotMatch(sheet,/<f[ >]/);assert.equal((sheet.match(/<c /g)||[]).length,21);
});
test('Excel checkpoint replaces workbook and removes temporary files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shopee-excel-'));try{const file=join(dir,'Danh sách.xlsx');await excel.saveWorkbook(file,[]);assert.equal((parts(await readFile(file)).get('xl/worksheets/sheet1.xml').match(/<row /g)||[]).length,1);
 await excel.saveWorkbook(file,[{url:'https://shopee.vn/product/1/2',name:'Video.mp4'}]);assert.match(parts(await readFile(file)).get('xl/worksheets/sheet1.xml'),/Video.mp4/);assert.deepEqual(await readdir(dir),['Danh sách.xlsx']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
