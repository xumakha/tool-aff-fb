// Optional real-site diagnostic: electron test/shopee-live-probe.cjs [product URLs].
// Uses a temporary, unsigned-in session and logs no cookies or signed media URLs.
const {app,BrowserWindow}=require('electron');
const {mkdtemp,unlink}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createMediaCapture}=require('../desktop/shopee-network.cjs');
const {mediaScript}=require('../desktop/shopee-media.cjs');
const {downloadVideo}=require('../desktop/shopee-transfer.cjs');
const {productIdentity}=require('../desktop/shopee-downloads.cjs');
const urls=process.argv.slice(2);
if(!urls.length)urls.push('https://shopee.vn/product/1006220775/43860967938','https://shopee.vn/product/1006220775/42711039675');
app.commandLine.appendSwitch('disable-background-timer-throttling');
let win,capture;
(async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'shopee-live-'));app.setPath('userData',temporary);
 await app.whenReady();
 win=new BrowserWindow({show:false,webPreferences:{partition:'shopee-live-probe',nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 await win.loadURL('about:blank');
 console.log('Shopee probe: renderer ready');
 capture=await createMediaCapture(win.webContents,{timeout:15000});
 for(const value of urls){
  const identity=productIdentity(value);if(!identity)throw Error('Expected Shopee product URL');
  capture.reset(identity.id);let timer;
  try{await Promise.race([win.loadURL(identity.url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('navigation timeout')),30000);})]);}
  catch(error){console.log(JSON.stringify({product:identity.id,loadError:error.message}));}
  finally{clearTimeout(timer);}
  let data,activated=false;
  for(let attempt=0;attempt<15;attempt++){
   await new Promise(resolve=>setTimeout(resolve,1000));
   data=await win.webContents.executeJavaScript(mediaScript,true);activated=activated||data.activated;
   if(capture.urls().length||data.urls.length)break;
  }
  console.log(JSON.stringify({product:identity.id,page:new URL(win.webContents.getURL()).pathname,root:data?.productRoot,activated,players:data?.players,sources:data?.urls.length,diagnostics:capture.diagnostics()}));
  const sources=[...capture.urls(),...(data?.urls||[])];
  if(sources.length){
   const file=path.join(temporary,'probe.part');
   try{const result=await downloadVideo({fetch:win.webContents.session.fetch.bind(win.webContents.session),sources,temporary:file,referer:identity.url,timeout:30000,retries:0});console.log(JSON.stringify({product:identity.id,downloaded:true,size:result.size}));}
   catch(error){console.log(JSON.stringify({product:identity.id,downloadError:error.message}));}
   finally{await unlink(file).catch(()=>{});}
  }
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{capture?.dispose();if(win&&!win.isDestroyed())win.destroy();app.quit();});
