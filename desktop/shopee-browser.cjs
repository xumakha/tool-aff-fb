function allowedNavigation(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='shopee.vn'||u.hostname.endsWith('.shopee.vn'));}catch{return false;}}
function authenticationPage(value){try{return /\/(?:buyer\/)?(?:login|signup|verify|captcha|authentication)(?:\/|$)/i.test(new URL(value).pathname);}catch{return false;}}
function createBrowserController(win,{update=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeout=10*60*1000}={}){
 const wc=win.webContents;let generation=0,rendererError='',disposed=false;
 const navigating=()=>{generation++;};
 const gone=(_event,details)=>{rendererError=`Cửa sổ Shopee bị dừng (${details.reason}, mã ${details.exitCode}). Đóng cửa sổ rồi thử tải lại.`;update(rendererError);};
 const guard=(event,legacyURL)=>{if(!allowedNavigation(event.url||legacyURL)){event.preventDefault();update('Chỉ hỗ trợ đăng nhập trực tiếp trên Shopee. Hãy dùng số điện thoại/email hoặc mã QR của Shopee.');}};
 wc.on('did-start-navigation',navigating);wc.on('render-process-gone',gone);wc.on('will-navigate',guard);wc.on('will-redirect',guard);
 function check(){if(rendererError)throw Object.assign(Error(rendererError),{browserFailure:true});if(disposed||win.isDestroyed()||wc.isDestroyed())throw Object.assign(Error('Đã dừng quét bằng cách đóng cửa sổ Shopee'),{browserFailure:true});}
 async function ready(deadline){let waiting=false;for(;;){check();if(now()>deadline)throw Error('Hết thời gian chờ trang Shopee. Đăng nhập xong rồi thử tải lại.');if(!wc.isLoadingMainFrame()&&!authenticationPage(wc.getURL()))return;if(!waiting){update('Đang chờ chuyển trang / đăng nhập Shopee. Hoàn tất đăng nhập trong cửa sổ Shopee để tiếp tục.');waiting=true;}await sleep(250);}}
 async function execute(script,userGesture=false){const deadline=now()+timeout;for(;;){await ready(deadline);const before=generation;try{const result=await wc.executeJavaScript(script,userGesture);if(before===generation&&!wc.isLoadingMainFrame()&&!authenticationPage(wc.getURL()))return result;}catch(error){check();if(before===generation&&!wc.isLoadingMainFrame()&&!authenticationPage(wc.getURL())&&!/context.*destroyed|frame.*disposed|ERR_ABORTED/i.test(error.message))throw error;}await sleep(250);}}
 async function load(url){check();try{await win.loadURL(url);}catch(error){check();if(error.code!=='ERR_ABORTED'&&error.errno!==-3)throw error;}await ready(now()+timeout);}
 wc.setWindowOpenHandler(({url})=>{if(allowedNavigation(url)){load(url).catch(error=>update(error.message));}else update('Hãy đăng nhập trực tiếp bằng số điện thoại/email hoặc mã QR trong cửa sổ Shopee.');return {action:'deny'};});
 return {execute,load,dispose(){disposed=true;wc.removeListener('did-start-navigation',navigating);wc.removeListener('render-process-gone',gone);wc.removeListener('will-navigate',guard);wc.removeListener('will-redirect',guard);}};
}
module.exports={allowedNavigation,authenticationPage,createBrowserController};
