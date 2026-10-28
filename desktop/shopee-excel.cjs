const ExcelJS=require('exceljs');
const {readFileSync}=require('node:fs');
const {writeFile,rename,unlink}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
// Use the supplied Shopee workbook itself, including its sheet name, views and styles.
const template=readFileSync(path.join(__dirname,'templates','shopee-batch-custom-links.xlsx'));
const headers=['Liên kết gốc','Sub_id1','Sub_id2','Sub_id3','Sub_id4','Sub_id5'];
const value=text=>String(text??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'');
async function workbook(rows){const book=new ExcelJS.Workbook();await book.xlsx.load(template);const sheet=book.getWorksheet('Sheet1');if(!sheet||headers.some((name,i)=>sheet.getRow(1).getCell(i+1).value!==name))throw Error('Mẫu Excel Shopee không đúng cấu trúc');
 const nameHeader=sheet.getCell('G1');nameHeader.value='Tên sản phẩm';nameHeader.style=structuredClone(sheet.getCell('A1').style);sheet.getColumn(7).width=80;
 for(const item of rows){const row=sheet.addRow([value(item.url),...Array.from({length:5},(_,i)=>value(item['sub_id'+(i+1)])),value(item.name)]);for(let col=1;col<=7;col++)row.getCell(col).style=structuredClone(sheet.getRow(1).getCell(col).style);}
 return Buffer.from(await book.xlsx.writeBuffer());
}
async function saveWorkbook(file,rows){const temporary=path.join(path.dirname(file),`.shopee-excel-${randomUUID()}.tmp`);try{await writeFile(temporary,await workbook(rows),{flag:'wx'});await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}}
module.exports={workbook,saveWorkbook};
