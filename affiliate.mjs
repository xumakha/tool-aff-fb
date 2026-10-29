import ExcelJS from 'exceljs';
import {randomUUID} from 'node:crypto';
const sessions=new Map();
const text=cell=>{const v=cell?.value;if(v==null)return '';if(typeof v==='object'){if(v.hyperlink)return v.hyperlink;if(v.richText)return v.richText.map(x=>x.text).join('');if('result' in v)return String(v.result??'');return String(v.text??'');}return String(v);};
export function productKey(value){try{const u=new URL(String(value).trim());if(!['https:','http:'].includes(u.protocol)||!['shopee.vn','www.shopee.vn'].includes(u.hostname)||u.username||u.password)return null;const m=u.pathname.match(/(?:-i\.|\/product\/)(\d+)[./](\d+)\/?$/);return m?m.slice(1).map(x=>x.replace(/^0+(?=\d)/,'')).join(':'):null;}catch{return null;}}
function affiliateURL(value){try{const u=new URL(String(value).trim());return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['shopee.vn','shope.ee','shopee.com.vn'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
function expire(){for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);}
export function suggestMapping(sheets){
 const candidates=[];
 for(const sheet of sheets)for(let h=0;h<sheet.preview.length;h++){
  const names=sheet.preview[h].map(n=>String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  const originals=names.flatMap((n,i)=>/lien ket goc|link goc|link san pham|product.*(link|url)|original|origin.*(link|url)/.test(n)&&!/aff|convert/.test(n)?[i]:[]);
  const affiliates=names.flatMap((n,i)=>/affiliate|aff|short.*(link|url)|convert|link chuyen doi|lien ket chuyen doi|lien ket rut gon/.test(n)?[i]:[]);
  if(originals.length!==1||affiliates.length!==1||originals[0]===affiliates[0])continue;
  if(!sheet.preview.slice(h+1).some(row=>productKey(row[originals[0]])&&affiliateURL(row[affiliates[0]])))continue;
  candidates.push({sheet:sheet.id,header:h+1,urlColumn:originals[0]+1,affiliateColumn:affiliates[0]+1});
 }
 return candidates.length===1?candidates[0]:null;
}
export async function inspectFile({name,data}){expire();if(sessions.size>=8)throw Error('Đang mở quá nhiều file. Tải lại sau 30 phút hoặc dùng các file đã chọn.');if(typeof data!=='string'||data.length>28*1024*1024)throw Error('File tối đa 20 MB');const bytes=Buffer.from(data,'base64');if(bytes.length>20*1024*1024)throw Error('File tối đa 20 MB');const book=new ExcelJS.Workbook();if(/\.xlsx$/i.test(name))await book.xlsx.load(bytes);else if(/\.csv$/i.test(name)){const {Readable}=await import('node:stream');await book.csv.read(Readable.from([bytes]),{map:value=>value,parserOptions:{delimiter:bytes.toString('utf8',0,2000).split('\n')[0].split(';').length>bytes.toString('utf8',0,2000).split('\n')[0].split(',').length?';':','}});}else throw Error('Chỉ hỗ trợ .xlsx và .csv. Với .xls, hãy Save As .xlsx trước.');
 if(!book.worksheets.length)throw Error('File không có sheet');let cells=0;for(const sheet of book.worksheets){cells+=sheet.rowCount*Math.max(1,sheet.columnCount);if(cells>1000000||sheet.columnCount>200||sheet.rowCount>100000)throw Error('File quá nhiều dòng/cột');}
 const id=randomUUID();sessions.set(id,{book,name,expires:Date.now()+30*60*1000});setTimeout(()=>sessions.delete(id),30*60*1000).unref();return {id,name,sheets:book.worksheets.map(s=>({id:s.id,name:s.name,rows:s.rowCount,columns:s.columnCount,preview:Array.from({length:Math.min(30,s.rowCount)},(_,r)=>Array.from({length:s.columnCount},(_,c)=>text(s.getRow(r+1).getCell(c+1)).slice(0,300)))}))};
}
function selection(input){expire();const session=sessions.get(input?.id);if(!session)throw Error('File đã hết phiên (30 phút). Chọn lại file.');const sheet=session.book.getWorksheet(Number(input.sheet));const header=Number(input.header);if(!sheet||!Number.isInteger(header)||header<1||header>Math.min(30,sheet.rowCount))throw Error('Chọn sheet và dòng tiêu đề hợp lệ');return {...session,sheet,header};}
function column(value,sheet){const col=Number(value);if(!Number.isInteger(col)||col<1||col>sheet.columnCount)throw Error('Chọn cột hợp lệ');return col;}
export async function mergeAffiliate({video,mapping},sourceRows){
 let v,vc;
 if(sourceRows){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Video');sheet.addRow(['Liên kết gốc','Tên sản phẩm']);for(const row of sourceRows)sheet.addRow([row.url,row.name]);v={sheet,header:1};vc=1;}
 else{if(video?.id===mapping?.id)throw Error('Chọn hai file khác nhau');v=selection(video);vc=column(video.urlColumn,v.sheet);}
 const m=selection(mapping),mc=column(mapping.urlColumn,m.sheet),ac=column(mapping.affiliateColumn,m.sheet);if(mc===ac)throw Error('Cột link gốc và link affiliate phải khác nhau');
 const index=new Map();let invalidMapping=0;for(let r=m.header+1;r<=m.sheet.rowCount;r++){const row=m.sheet.getRow(r),original=text(row.getCell(mc)),aff=text(row.getCell(ac)).trim();if(!original&&!aff)continue;const key=productKey(original);if(!key||!affiliateURL(aff)){invalidMapping++;continue;}if(!index.has(key))index.set(key,new Set());index.get(key).add(aff);}
 const headers=v.sheet.getRow(v.header);let nameCol=0;const subs=Array(5).fill(0);headers.eachCell((cell,col)=>{const name=cell.text.trim().toLowerCase();if(name==='tên sản phẩm')nameCol=col;const sub=name.match(/^sub_id([1-5])$/);if(sub)subs[Number(sub[1])-1]=col;});if(!nameCol)throw Error('Excel video phải có cột Tên sản phẩm');
 const rows=[],stats={matched:0,unmatched:0,conflicts:0,invalid:0,invalidMapping};for(let r=v.header+1;r<=v.sheet.rowCount;r++){const row=v.sheet.getRow(r),url=text(row.getCell(vc));if(!url)continue;const key=productKey(url),links=key?index.get(key):null;if(!key){stats.invalid++;}else if(!links){stats.unmatched++;}else if(links.size>1){stats.conflicts++;}else{const name=text(row.getCell(nameCol));if(!name.trim()){stats.invalid++;continue;}stats.matched++;rows.push([url,...subs.map(col=>col?text(row.getCell(col)):''),name,[...links][0]]);}}
 return {rows,stats};
}

const masterHeaders=['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung'];
export async function ensureAffiliateMaster(directory,previous=''){
 const {mkdir,stat,readFile,writeFile}=await import('node:fs/promises');
 const {resolve}=await import('node:path');
 const file=resolve(directory,'Tong-hop-affiliate.xlsx');
 await mkdir(directory,{recursive:true});
 try{await stat(file);return file;}catch(error){if(error.code!=='ENOENT')throw error;}
 let bytes;
 if(previous&&resolve(previous)!==file){bytes=await readFile(previous);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);}
 else{const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('sheet 1');sheet.addRow(masterHeaders);bytes=Buffer.from(await book.xlsx.writeBuffer());}
 try{await writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 return file;
}
const writing=new Set();
export async function appendAffiliate(file,input,sourceRows){
 if(writing.has(file))throw Error('Đang ghi file tổng hợp. Vui lòng đợi.');writing.add(file);
 const {readFile,stat,writeFile,rename,unlink}=await import('node:fs/promises');const {dirname,join}=await import('node:path');let temporary;
 try{const result=await mergeAffiliate(input,sourceRows);const before=await stat(file);if(before.size>50*1024*1024)throw Error('File tổng hợp vượt 50 MB');const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(file));let sheet=book.getWorksheet('sheet 1');if(!sheet)sheet=book.addWorksheet('sheet 1');
 if(sheet.actualRowCount===0)sheet.addRow(masterHeaders);else for(let i=0;i<masterHeaders.length;i++)if(sheet.getRow(1).getCell(i+1).text!==masterHeaders[i])throw Error('Tab sheet 1 phải có đúng tiêu đề A–D: '+masterHeaders.join(', '));
 const key=row=>JSON.stringify([productKey(row[0])||row[0],...row.slice(1,3)]);const existing=new Set();for(let i=2;i<=sheet.rowCount;i++)existing.add(key(masterHeaders.map((_,j)=>text(sheet.getRow(i).getCell(j+1)))));
 let added=0,duplicates=0;for(const source of result.rows){const row=[source[0],source[6],source[7],source[6]+'\n'+source[7]];const id=key(row);if(existing.has(id)){duplicates++;continue;}const addedRow=sheet.addRow(row);addedRow.getCell(4).alignment={wrapText:true,vertical:'top'};addedRow.height=45;existing.add(id);added++;}
 if(added){sheet.getColumn(1).width=65;sheet.getColumn(2).width=80;sheet.getColumn(3).width=65;sheet.getColumn(4).width=90;temporary=join(dirname(file),`.affiliate-${randomUUID()}.tmp`);await writeFile(temporary,Buffer.from(await book.xlsx.writeBuffer()),{flag:'wx'});const current=await stat(file);if(current.size!==before.size||current.mtimeMs!==before.mtimeMs||current.ino!==before.ino)throw Error('File tổng hợp vừa thay đổi bên ngoài. Đóng Excel rồi thực hiện lại.');await rename(temporary,file);}
 return {path:file,added,duplicates,stats:result.stats,matchedRows:result.rows};
 }catch(error){if(['EBUSY','EPERM','EACCES'].includes(error.code))throw Error('Không ghi được file tổng hợp. Hãy đóng file trong Excel và kiểm tra quyền ghi: '+file);throw error;}finally{if(temporary)await unlink(temporary).catch(()=>{});writing.delete(file);}
}
