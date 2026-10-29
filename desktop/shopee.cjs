const {BrowserWindow,dialog}=require('electron');
const {open,unlink,link,stat}=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {collectProducts,loadHistory,saveHistory,existingDownload}=require('./shopee-downloads.cjs');
const {saveExports,createShopDirectory}=require('./shopee-excel.cjs');
const {shopURL,filename,videoURL}=require('./shopee-url.cjs');
const {createBrowserController}=require('./shopee-browser.cjs');
const {stockScript}=require('./shopee-stock.cjs');
const {createMediaCapture}=require('./shopee-network.cjs');
const {cardsScript:cards,prioritizeProducts}=require('./shopee-cards.cjs');
const {productTitleScript,mediaScript:media,downloadableVideo}=require('./shopee-media.cjs');
function install(worker,parent){let running=false,lastWindow;const send=s=>{if(worker.connected)worker.send({type:'shopee-state',state:s},()=>{});};
 worker.on('message',message=>{if(message.type!=='shopee-start'||running)return;running=true;if(lastWindow&&!lastWindow.isDestroyed())lastWindow.close();let win,browser,capture,cancelled=false,failed=false;let state={running:true,downloaded:0,reused:0,checked:0,found:0,errors:[],message:'Chọn thư mục lưu video'};const update=message=>{state.message=message;send(state);};const skip=(url,reason)=>{state.skipped=[...(state.skipped||[]),{url,reason}].slice(-500);send(state);};
 (async()=>{const url=shopURL(message.url);const selected=await dialog.showOpenDialog(parent(),{title:'Chọn thư mục lưu video Shopee',properties:['openDirectory','createDirectory']});if(selected.canceled){update('Đã hủy');return;}const folder=selected.filePaths[0];state.folder=folder;const history=await loadHistory(folder);

 win=new BrowserWindow({width:1100,height:800,title:'Shopee · Đóng cửa sổ để dừng quét',webPreferences:{partition:'persist:shopee',nodeIntegration:false,contextIsolation:true,sandbox:true}});lastWindow=win;browser=createBrowserController(win,{update});win.on('close',()=>{cancelled=true;browser.dispose();capture?.dispose();});win.on('closed',()=>{cancelled=true;});
 const pause=async ms=>{await new Promise(r=>setTimeout(r,ms));if(cancelled)throw Error('Đã dừng quét bằng cách đóng cửa sổ Shopee');};
 const execute=(script,userGesture=false)=>browser.execute(script,userGesture);
 await browser.load(url);update('Đang chờ sản phẩm. Đăng nhập / xử lý CAPTCHA trong cửa sổ Shopee nếu được yêu cầu.');
 try{capture=await createMediaCapture(win.webContents);if(cancelled){capture.dispose();return;}}catch(error){update('Không bật được bộ dò dữ liệu video: '+error.message+' · Tiếp tục dò trên trang.');}
 let products=new Map(),empty=0;
 for(let page=0;page<100;page++){
  const pageStart=products.size;
  let previous=0,stable=0;for(let scroll=0;scroll<60;scroll++){await pause(1500);const items=await execute(cards);collectProducts(products,items);if(items.length===0){if(++empty>=120)throw Error('Không đọc được sản phẩm. Shopee có thể yêu cầu đăng nhập hoặc chặn truy cập.');continue;}empty=0;stable=products.size===previous?stable+1:0;previous=products.size;update(`Đã tìm ${products.size} sản phẩm · đang cuộn trang ${page+1}`);await execute('window.scrollBy(0, Math.max(500,innerHeight*0.8))');if(stable>=8)break;}
  if(page>0 && products.size===pageStart)break;
  const next=await execute(`(()=>{const b=document.querySelector('.shopee-icon-button--right');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return false;b.click();window.scrollTo(0,0);return true})()`);if(!next)break;await pause(2500);
 }
 if(!products.size)throw Error('Không tìm thấy sản phẩm');state.found=products.size;
 const shopName=await execute(`(()=>{const name=document.querySelector('.section-seller-overview-horizontal__portrait-name,.shop-page .shop-name,[data-testid="shop-name"]')?.textContent;return name?.trim()||document.querySelector('meta[property="og:title"]')?.content?.replace(/\\s*[|]\\s*Shopee.*$/i,'').trim()||'';})()`);
 const excelDirectory=await createShopDirectory(folder,shopName,url);const excelPath=path.join(excelDirectory,'Ten va Link SP.xlsx');const rows=[];await saveExports(excelDirectory,rows);state.excelPath=excelPath;state.affiliateExcelPath=path.join(excelDirectory,'Shopee Affiliate.xlsx');
 // Inspect every product as icon markup can vary between shop layouts.
 for(const product of prioritizeProducts(products)){
  if(cancelled)break;state.checked++;update(`Đang kiểm tra ${state.checked}/${state.found}${product.xtra?' · Hoa hồng Xtra':''} · tải mới ${state.downloaded} · đã có ${state.reused}`);
  try{
   capture?.reset(product.id);await browser.load(product.url);await pause(1000);
   if(await execute(stockScript)){state.soldOut=(state.soldOut||0)+1;skip(product.url,'Phần thông tin sản phẩm hiển thị Hết hàng / Sold out');update(`Bỏ qua sản phẩm hết hàng · ${state.soldOut} sản phẩm`);continue;}
   const recorded=history.items[product.id];const existing=await existingDownload(folder,recorded);
   if(existing){let productName=recorded.productName;if(!productName){for(let attempt=0;attempt<20;attempt++){productName=await execute(productTitleScript);if(productName)break;await pause(1000);}if(productName){recorded.productName=productName;await saveHistory(folder,history);}}productName=productName||path.basename(existing,'.mp4');rows.push({url:product.url,name:productName});if(worker.connected)worker.send({type:'shopee-file',path:existing,url:product.url,name:path.basename(existing),productName,reused:true});try{await saveExports(excelDirectory,rows);}catch(error){error.excelFailure=true;throw error;}state.reused++;continue;}
   let data,soldOut=false,activated=false;for(let attempt=0;attempt<20;attempt++){await pause(1000);if(await execute(stockScript)){soldOut=true;break;}data=await execute(media,true);activated=activated||data.activated;data.urls=[...new Set([...(capture?.urls()||[]),...data.urls])];if(data.urls.some(downloadableVideo))break;}
   if(soldOut){state.soldOut=(state.soldOut||0)+1;skip(product.url,'Phần thông tin sản phẩm hiển thị Hết hàng / Sold out');update(`Bỏ qua sản phẩm hết hàng · ${state.soldOut} sản phẩm`);continue;}
   const source=data?.urls.find(downloadableVideo);if(!source){const diagnostics=capture?.diagnostics()||{};const detail=` [API HTTP=${diagnostics.http??'none'}, body=${diagnostics.read?'ok':diagnostics.bodyUnavailable?'unavailable':'none'}, error=${diagnostics.apiError??'none'}; root=${!!data?.productRoot}, activated=${activated}, players=${data?.players||0}, sources=${data?.urls.length||0}]`;state.noVideo=(state.noVideo||0)+1;skip(product.url,(data?.urls.some(u=>/^blob:|\.m3u8(?:[?]|$)/i.test(u))?'Video dùng blob/HLS, chưa lấy được MP4 trực tiếp':product.marked?'Có biểu tượng video nhưng sau 20 lần kiểm tra chưa lấy được nguồn tải':'Sau 20 lần kiểm tra chưa tìm thấy nguồn video tải được; có thể chưa bật video hoặc trang chưa tải đủ')+detail);continue;}
   const tmp=path.join(folder,`.shopee-${randomUUID()}.part`);let handle;
   try{let response;let target=source;for(let redirects=0;redirects<=5;redirects++){if(!videoURL(target))throw Error('Địa chỉ video không thuộc CDN Shopee');response=await win.webContents.session.fetch(target,{redirect:'manual',signal:AbortSignal.timeout(120000)});if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Redirect thiếu địa chỉ');target=new URL(location,target).href;continue;}break;}
    if(!response.ok||!response.body)throw Error('Không tải được video');handle=await open(tmp,'wx');let size=0,header=Buffer.alloc(0);for await(const chunk of response.body){if(cancelled)throw Error('Đã dừng');size+=chunk.length;if(size>1024*1024*1024)throw Error('Video vượt 1 GB');if(header.length<12)header=Buffer.concat([header,Buffer.from(chunk)]).subarray(0,12);await handle.writeFile(chunk);}await handle.close();handle=null;if(size<12||header.toString('ascii',4,8)!=='ftyp')throw Error('Nguồn trả về không phải MP4');
    const productName=data.title.replace(/\s*\|\s*Shopee.*$/i,'').trim();const base=filename(productName);let saved;for(let n=0;n<10000;n++){saved=path.join(folder,`${base}${n?' ('+(n+1)+')':''}.mp4`);try{await link(tmp,saved);break;}catch(e){if(e.code!=='EEXIST')throw e;if(n===9999)throw Error('Quá nhiều tên trùng');}}state.downloaded++;if(worker.connected)worker.send({type:'shopee-file',path:saved,url:product.url,name:path.basename(saved),productName});
    const info=await stat(saved);history.items[product.id]={name:path.basename(saved),productName,size:info.size,mtime:info.mtimeMs};
    try{await saveHistory(folder,history);}catch(error){const fatal=Error('Video đã lưu nhưng không ghi được lịch sử chống trùng. Dừng lượt tải: '+error.message);fatal.excelFailure=true;throw fatal;}
    rows.push({url:product.url,name:productName});
    try{await saveExports(excelDirectory,rows);}catch(error){const fatal=Error('Đã tải video nhưng không cập nhật được Excel. Đóng Excel nếu đang mở, kiểm tra quyền ghi/ổ đĩa rồi thử lại. File: '+excelPath+' · '+error.message);fatal.excelFailure=true;throw fatal;}

   }finally{if(handle)await handle.close();await unlink(tmp).catch(()=>{});}
  }catch(e){if(e.excelFailure||e.browserFailure)throw e;state.errors.push({url:product.url,error:e.message});state.errors=state.errors.slice(-100);if(cancelled)break;}
 }
 update(`Hoàn tất: tải mới ${state.downloaded}, đã có ${state.reused} video / kiểm tra ${state.checked} sản phẩm · ${state.soldOut||0} hết hàng · ${state.noVideo||0} chưa lấy được nguồn video · ${state.errors.length} lỗi. Xem mục Sản phẩm bỏ qua để biết link và lý do. Có thể còn sản phẩm bị Shopee ẩn hoặc chặn.`);
 })().catch(e=>{if(cancelled){update('Đã dừng quét Shopee.');return;}failed=true;update(e.message+' · Lượt tải đã dừng. Có thể hoàn tất đăng nhập rồi bấm tải lại.');}).finally(()=>{state.running=false;running=false;send(state);if(win&&!win.isDestroyed()&&!failed)win.close();});
 });
}
module.exports={install,shopURL,filename,videoURL};
