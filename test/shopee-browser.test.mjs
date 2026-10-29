import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import browser from '../desktop/shopee-browser.cjs';
function fixture(options={}){
 const wc=new EventEmitter();let url='https://shopee.vn/shop',loading=false,destroyed=false;
 Object.assign(wc,{isDestroyed:()=>destroyed,isLoadingMainFrame:()=>loading,getURL:()=>url,setWindowOpenHandler:handler=>{wc.popup=handler;},executeJavaScript:async()=>['product']});
 const win={webContents:wc,isDestroyed:()=>destroyed,loadURL:async value=>{url=value;}};
 const controller=browser.createBrowserController(win,options);
 return {wc,win,controller,setURL:value=>{url=value;},setLoading:value=>{loading=value;},destroy:()=>{destroyed=true;}};
}
test('navigation permits HTTPS Shopee login only and handles modern and legacy events',()=>{
 for(const u of ['https://shopee.vn/buyer/login','https://accounts.shopee.vn/login'])assert.equal(browser.allowedNavigation(u),true);
 for(const u of ['https://shopee.vn.evil.test/login','javascript:alert(1)','http://shopee.vn/login','https://user@shopee.vn/login'])assert.equal(browser.allowedNavigation(u),false);
 const f=fixture();let blocked=0;f.wc.emit('will-navigate',{url:'https://shopee.vn/buyer/login',preventDefault:()=>blocked++});f.wc.emit('will-redirect',{preventDefault:()=>blocked++},'https://evil.test');assert.equal(blocked,1);
});
test('scanner waits for login and resumes without executing on authentication page',async()=>{
 let f,waited=0;f=fixture({sleep:async()=>{waited++;f.setURL('https://shopee.vn/shop');}});f.setURL('https://shopee.vn/buyer/login');
 assert.deepEqual(await f.controller.execute('cards'),['product']);assert.equal(waited,1);
});
test('navigation interrupting execution is retried instead of ending the scan',async()=>{
 const f=fixture({sleep:async()=>{}});let calls=0;f.wc.executeJavaScript=async()=>{if(++calls===1){f.wc.emit('did-start-navigation');throw Error('Script failed to execute');}return ['product'];};
 assert.deepEqual(await f.controller.execute('cards'),['product']);assert.equal(calls,2);
});
test('aborted load during login redirect waits; ordinary script failures remain visible',async()=>{
 let f;f=fixture({sleep:async()=>f.setURL('https://shopee.vn/shop')});f.win.loadURL=async()=>{f.setURL('https://shopee.vn/buyer/login');throw Object.assign(Error('aborted'),{code:'ERR_ABORTED'});};
 await f.controller.load('https://shopee.vn/shop');f.wc.executeJavaScript=async()=>{throw Error('bug in scanner');};await assert.rejects(f.controller.execute('broken'),/bug in scanner/);
});
test('closing the browser, renderer crash and login timeout terminate with clear errors',async()=>{
 const closed=fixture();closed.destroy();await assert.rejects(closed.controller.execute('cards'),/Đã dừng/);
 const crashed=fixture();crashed.wc.emit('render-process-gone',{}, {reason:'crashed',exitCode:1});await assert.rejects(crashed.controller.execute('cards'),/crashed/);
 let time=0;const stalled=fixture({now:()=>time,timeout:1,sleep:async()=>{time+=2;}});stalled.setURL('https://shopee.vn/buyer/login');await assert.rejects(stalled.controller.execute('cards'),/Hết thời gian/);
});
