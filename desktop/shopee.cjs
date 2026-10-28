const {BrowserWindow,dialog}=require('electron');
const {open,unlink,link}=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {saveWorkbook}=require('./shopee-excel.cjs');
const {shopURL,filename,videoURL}=require('./shopee-url.cjs');
const cards=`(()=>{const out=[];for(const a of document.querySelectorAll('a[href]')){const u=new URL(a.href,location.href);if(u.hostname!=='shopee.vn'||!(/-i\\.\\d+\\.\\d+/.test(u.pathname)||/\\/product\\/\\d+\\/\\d+/.test(u.pathname)))continue;const card=a.closest('[data-sqe="item"]')||a;out.push({url:u.origin+u.pathname,marked:!!card.querySelector('.shopee_ic .stroke-none, .shopee_ic.stroke-none')});}return out})()`;
const media=`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{});}const title=document.querySelector('h1')?.innerText||document.querySelector('meta[property="og:title"]')?.content||document.title;const urls=[v?.currentSrc,v?.src,...Array.from(document.querySelectorAll('video source')).map(x=>x.src),...performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/\\.mp4(?:[?]|$)/i.test(x))];return {title,urls:urls.filter(Boolean)}})()`;
function install(worker,parent){let running=false;const send=s=>{if(worker.connected)worker.send({type:'shopee-state',state:s});};
 worker.on('message',message=>{if(message.type!=='shopee-start'||running)return;running=true;let win,cancelled=false;let state={running:true,downloaded:0,checked:0,found:0,errors:[],message:'Chọn thư mục lưu video'};const update=message=>{state.message=message;send(state);};
 (async()=>{const url=shopURL(message.url);const selected=await dialog.showOpenDialog(parent(),{title:'Chọn thư mục lưu video Shopee',properties:['openDirectory','createDirectory']});if(selected.canceled){update('Đã hủy');return;}const folder=selected.filePaths[0];state.folder=folder;
 update('Chọn nơi lưu file Excel');const excel=await dialog.showSaveDialog(parent(),{title:'Lưu danh sách video Shopee',defaultPath:path.join(folder,'video-shopee.xlsx'),filters:[{name:'Excel',extensions:['xlsx']}]});if(excel.canceled||!excel.filePath){update('Đã hủy');return;}const excelPath=/\.xlsx$/i.test(excel.filePath)?excel.filePath:excel.filePath+'.xlsx';const rows=[];await saveWorkbook(excelPath,rows);state.excelPath=excelPath;

 win=new BrowserWindow({width:1100,height:800,title:'Shopee · Đóng cửa sổ để dừng quét',webPreferences:{partition:'persist:shopee',nodeIntegration:false,contextIsolation:true,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,target)=>{try{if(new URL(target).hostname!=='shopee.vn')e.preventDefault();}catch{e.preventDefault();}});win.webContents.on('will-redirect',(e,target)=>{try{if(new URL(target).hostname!=='shopee.vn')e.preventDefault();}catch{e.preventDefault();}});win.on('closed',()=>{cancelled=true;});
 const pause=async ms=>{await new Promise(r=>setTimeout(r,ms));if(cancelled)throw Error('Đã dừng quét bằng cách đóng cửa sổ Shopee');};
 const execute=script=>win.webContents.executeJavaScript(script);
 await win.loadURL(url);update('Đang chờ sản phẩm. Đăng nhập / xử lý CAPTCHA trong cửa sổ Shopee nếu được yêu cầu.');
 let products=new Map(),empty=0;
 for(let page=0;page<100;page++){
  const pageStart=products.size;
  let previous=0,stable=0;for(let scroll=0;scroll<60;scroll++){await pause(1500);const items=await execute(cards);for(const item of items)products.set(item.url,item);if(items.length===0){if(++empty>=120)throw Error('Không đọc được sản phẩm. Shopee có thể yêu cầu đăng nhập hoặc chặn truy cập.');continue;}empty=0;stable=products.size===previous?stable+1:0;previous=products.size;update(`Đã tìm ${products.size} sản phẩm · đang cuộn trang ${page+1}`);await execute('window.scrollBy(0, Math.max(500,innerHeight*0.8))');if(stable>=8)break;}
  if(page>0 && products.size===pageStart)break;
  const next=await execute(`(()=>{const b=document.querySelector('.shopee-icon-button--right');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return false;b.click();window.scrollTo(0,0);return true})()`);if(!next)break;await pause(2500);
 }
 if(!products.size)throw Error('Không tìm thấy sản phẩm');state.found=products.size;
 // Inspect every product as icon markup can vary between shop layouts.
 for(const product of products.values()){
  if(cancelled)break;state.checked++;update(`Đang kiểm tra ${state.checked}/${state.found} · đã tải ${state.downloaded}`);
  try{await win.loadURL(product.url);let data;for(let attempt=0;attempt<20;attempt++){await pause(1000);data=await execute(media);if(data.urls.some(videoURL))break;}const source=data.urls.find(videoURL);if(!source){if(product.marked)throw Error('Có biểu tượng video nhưng chưa lấy được MP4');continue;}
   const tmp=path.join(folder,`.shopee-${randomUUID()}.part`);let handle;
   try{let response;let target=source;for(let redirects=0;redirects<=5;redirects++){if(!videoURL(target))throw Error('Địa chỉ video không thuộc CDN Shopee');response=await win.webContents.session.fetch(target,{redirect:'manual',signal:AbortSignal.timeout(120000)});if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Redirect thiếu địa chỉ');target=new URL(location,target).href;continue;}break;}
    if(!response.ok||!response.body)throw Error('Không tải được video');handle=await open(tmp,'wx');let size=0,header=Buffer.alloc(0);for await(const chunk of response.body){if(cancelled)throw Error('Đã dừng');size+=chunk.length;if(size>1024*1024*1024)throw Error('Video vượt 1 GB');if(header.length<12)header=Buffer.concat([header,Buffer.from(chunk)]).subarray(0,12);await handle.writeFile(chunk);}await handle.close();handle=null;if(size<12||header.toString('ascii',4,8)!=='ftyp')throw Error('Nguồn trả về không phải MP4');
    const base=filename(data.title.replace(/\s*\|\s*Shopee.*$/i,''));let saved;for(let n=0;n<10000;n++){saved=path.join(folder,`${base}${n?' ('+(n+1)+')':''}.mp4`);try{await link(tmp,saved);break;}catch(e){if(e.code!=='EEXIST')throw e;if(n===9999)throw Error('Quá nhiều tên trùng');}}state.downloaded++;if(worker.connected)worker.send({type:'shopee-file',path:saved});
    rows.push({url:product.url,name:path.basename(saved)});
    try{await saveWorkbook(excelPath,rows);}catch(error){const fatal=Error('Đã tải video nhưng không cập nhật được Excel. Đóng Excel nếu đang mở, kiểm tra quyền ghi/ổ đĩa rồi thử lại. File: '+excelPath+' · '+error.message);fatal.excelFailure=true;throw fatal;}

   }finally{if(handle)await handle.close();await unlink(tmp).catch(()=>{});}
  }catch(e){if(e.excelFailure)throw e;state.errors.push({url:product.url,error:e.message});state.errors=state.errors.slice(-100);if(cancelled)break;}
 }
 update(`Hoàn tất: tải ${state.downloaded} video / kiểm tra ${state.checked} sản phẩm. ${state.errors.length} lỗi. Có thể còn sản phẩm bị Shopee ẩn hoặc chặn.`);
 })().catch(e=>update(e.message)).finally(()=>{state.running=false;running=false;send(state);if(win&&!win.isDestroyed())win.close();});
 });
}
module.exports={install,shopURL,filename,videoURL};
