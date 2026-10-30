import ExcelJS from 'exceljs';
import {stat,readFile} from 'node:fs/promises';

const headers=['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung'];
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
function cellText(cell){
 const value=cell.value;
 if(value==null)return '';
 if(typeof value!=='object')return String(value);
 if(value.richText)return value.richText.map(part=>part.text).join('');
 if('result' in value)return String(value.result??'');
 return String(value.text??value.hyperlink??'');
}
// This reader never initializes, migrates, saves or evaluates workbook formulas.
export async function readMasterRows(file){
 const info=await stat(file);
 if(info.size>50*1024*1024)throw Error('File tổng vượt 50 MB, chưa thể hiển thị.');
 const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(file));
 const sheet=book.getWorksheet('sheet 1');
 if(!sheet)throw Error('File tổng chưa có trang “sheet 1”.');
 const rows=[];
 sheet.eachRow((row,index)=>{
  if(index===1)return;
  const cells=headers.map((_,column)=>cellText(row.getCell(column+1)));
  if(cells.every(value=>!value.trim()))return;
  rows.push({row:index,cells});
 });
 return {path:file,sheet:sheet.name,headers:headers.map((name,i)=>cellText(sheet.getRow(1).getCell(i+1))||name),rows};
}
export async function readMasterTable(file,{q='',page=1}={}){
 const data=await readMasterRows(file),total=data.rows.length,words=normalize(q.trim()).split(/\s+/).filter(Boolean);
 const rows=data.rows.filter(row=>{const searchable=normalize(row.cells.join(' '));return words.every(word=>searchable.includes(word));});
 const pageSize=100,pages=Math.max(1,Math.ceil(rows.length/pageSize));
 page=Math.min(pages,Math.max(1,Number.isSafeInteger(Number(page))?Number(page):1));
 return {...data,total,matched:rows.length,page,pages,pageSize,rows:rows.slice((page-1)*pageSize,page*pageSize)};
}
