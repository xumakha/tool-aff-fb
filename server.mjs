import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,createReadStream} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {Meta} from './meta.mjs';
import {scanFolder, pickFolder, checkUnchanged, selectVideos} from './local-media.mjs';
if (process.env.HOST && !['127.0.0.1','localhost','::1'].includes(process.env.HOST)) throw new Error('Bản PC chỉ lắng nghe localhost');
const root = process.env.DATA_DIR || 'data'; mkdirSync(root,{recursive:true});
const db = new DatabaseSync(`${root}/reels.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY,name TEXT,token TEXT); CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,name TEXT,size INTEGER); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,page_id TEXT,media_id TEXT,caption TEXT,due TEXT,status TEXT DEFAULT 'queued',video_id TEXT,error TEXT,created TEXT);`);
// Additive migration preserves existing uploads and scheduled jobs.
const columns = db.prepare('PRAGMA table_info(media)').all().map(c=>c.name);
for (const [name,type] of [['path','TEXT'],['mtime','REAL'],['folder','TEXT'],['hidden','INTEGER DEFAULT 0']]) if (!columns.includes(name)) db.exec(`ALTER TABLE media ADD COLUMN ${name} ${type}`);
const jobColumns=db.prepare('PRAGMA table_info(jobs)').all().map(c=>c.name);
for(const [name,type] of [['batch_id','TEXT'],['progress','INTEGER DEFAULT 0'],['remote_now','INTEGER DEFAULT 0']])if(!jobColumns.includes(name))db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
// Hide scheduled media atomically with job creation, preserving source and history.
db.exec(`CREATE TRIGGER IF NOT EXISTS hide_scheduled_media AFTER INSERT ON jobs
 BEGIN UPDATE media SET hidden=1 WHERE id=NEW.media_id; END;`);
// Keep history and source files; remove confirmed publications from the library.
db.exec(`CREATE TRIGGER IF NOT EXISTS restore_cancelled_media AFTER UPDATE OF status ON jobs
 WHEN NEW.status='cancelled' AND OLD.status!='cancelled'
 AND NOT EXISTS(SELECT 1 FROM jobs WHERE media_id=NEW.media_id AND status IN ('queued','running','processing','review','remote_queued','remote_uploading','remote_confirming'))
 BEGIN UPDATE media SET hidden=0 WHERE id=NEW.media_id; END;`);
db.exec(`CREATE TRIGGER IF NOT EXISTS hide_published_media AFTER UPDATE OF status ON jobs
 WHEN NEW.status='published' AND OLD.status!='published'
 BEGIN UPDATE media SET hidden=1 WHERE id=NEW.media_id; END;`);
// An interrupted publish must be reconciled, never blindly repeated.
db.exec("UPDATE jobs SET status='review',error='Worker bị gián đoạn. Kiểm tra trên Facebook trước khi thử lại.' WHERE status IN ('running','remote_uploading','remote_confirming')");
const config = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET && /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '') && /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY || ''));
const meta = new Meta({version:process.env.META_GRAPH_VERSION,appSecret:process.env.META_APP_SECRET});
function crypt(value, decrypt=false) {
 const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY,'hex');
 if (decrypt) {const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'hex')); const c=createDecipheriv('aes-256-gcm',key,iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString();}
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv); const data=Buffer.concat([c.update(value),c.final()]); return [iv,c.getAuthTag(),data].map(x=>x.toString('hex')).join('.');
}
const states = new Map();
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=1024*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Dữ liệu vượt giới hạn');chunks.push(chunk);}return Buffer.concat(chunks);}
function auth(req){if(!process.env.ADMIN_PASSWORD)return true;const raw=Buffer.from((req.headers.authorization || '').replace(/^Basic /,''),'base64').toString(); const given=Buffer.from(raw.slice(raw.indexOf(':')+1)),wanted=Buffer.from(process.env.ADMIN_PASSWORD);return given.length===wanted.length && timingSafeEqual(given,wanted);}
const server=http.createServer(async(req,res)=>{try{
 if(!auth(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Reels Desk"'});return res.end('Authentication required');}
 const base=process.env.APP_URL || 'http://localhost:3000';const url=new URL(req.url,base);
 const allowedHosts=new Set(['localhost','127.0.0.1','[::1]',new URL(base).hostname]);
 if(!allowedHosts.has(new URL(`http://${req.headers.host}`).hostname))return json(res,403,{error:'Host không hợp lệ'});
 if(req.method!=='GET' && req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Yêu cầu từ website khác bị chặn'});
 const allowedOrigins=new Set([new URL(base).origin]);if(process.env.DESKTOP_MODE==='1'){allowedOrigins.add(`http://localhost:${process.env.PORT}`);allowedOrigins.add(`http://127.0.0.1:${process.env.PORT}`);}
 if(req.method!=='GET' && req.headers.origin && !allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origin không hợp lệ'});
 if(req.method==='GET' && url.pathname==='/api/state')return json(res,200,{configured:config(),pages:db.prepare('SELECT id,name FROM pages').all(),media:db.prepare('SELECT * FROM media WHERE COALESCE(hidden,0)=0').all(),jobs:db.prepare('SELECT jobs.*,pages.name AS page_name,media.name AS media_name FROM jobs LEFT JOIN pages ON pages.id=jobs.page_id LEFT JOIN media ON media.id=jobs.media_id ORDER BY due DESC').all()});
 if(url.pathname==='/auth/meta' && req.method==='GET'){
  if(!config())return json(res,400,{error:'Cần cấu hình Meta App, phiên bản API và khóa mã hóa trong .env'});
  const state=randomBytes(32).toString('hex');states.set(state,Date.now()+600000);for(const [k,v] of states)if(v<Date.now())states.delete(k);
  res.setHeader('Set-Cookie',`meta_state=${state}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${base.startsWith('https:')?'; Secure':''}`);
  const target=new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION}/dialog/oauth`);target.search=new URLSearchParams({client_id:process.env.META_APP_ID,redirect_uri:`${base}/auth/callback`,state,scope:'pages_show_list,pages_read_engagement,pages_manage_posts'});res.writeHead(302,{Location:target.href});return res.end();
 }
 if(url.pathname==='/auth/callback' && req.method==='GET'){
  const state=url.searchParams.get('state');const cookie=(req.headers.cookie || '').split('; ').find(x=>x.startsWith('meta_state='))?.slice(11);
  if(!state || cookie!==state || !(states.get(state)>Date.now()))throw new Error('Phiên kết nối không hợp lệ hoặc đã hết hạn');states.delete(state);
  if(!url.searchParams.get('code'))throw new Error('Bạn chưa cấp quyền Facebook');
  const exchange=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION}/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,redirect_uri:`${base}/auth/callback`,code:url.searchParams.get('code')}),signal:AbortSignal.timeout(30000)});
  const token=await exchange.json();if(!exchange.ok || !token.access_token)throw new Error('Không đổi được mã đăng nhập Meta');
  const pages=await meta.pages(token.access_token);for(const p of pages)if(p.access_token)db.prepare('INSERT OR REPLACE INTO pages VALUES(?,?,?)').run(p.id,p.name,crypt(p.access_token));
  res.writeHead(302,{Location:'/', 'Set-Cookie':'meta_state=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0'});return res.end();
 }
 if(url.pathname==='/api/folders/pick' && req.method==='POST')return json(res,200,{path:await pickFolder()});
 if(url.pathname==='/api/videos/pick' && req.method==='POST')return json(res,200,{paths:await pickFolder(true)});
 if(['/api/folders/import','/api/videos/import'].includes(url.pathname) && req.method==='POST'){
  const input=JSON.parse(await body(req));const scanned=url.pathname==='/api/videos/import'?await selectVideos(input.paths):await scanFolder(input.path);let added=0,existing=0;
  db.exec('BEGIN');
  try {
   for(const file of scanned.files){
    // Keep previous file versions for old jobs; never silently substitute changed content.
    const duplicate=db.prepare('SELECT id FROM media WHERE path=? AND size=? AND mtime=?').get(file.path,file.size,file.mtime);
    if(duplicate){db.prepare('UPDATE media SET hidden=0 WHERE id=?').run(duplicate.id);existing++;continue;}
    db.prepare('INSERT INTO media(id,name,size,path,mtime,folder) VALUES(?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),file.name,file.size,file.path,file.mtime,scanned.folder);added++;
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return json(res,200,{added,existing,skipped:scanned.skipped,folder:scanned.folder});
 }
 const mediaRoute=url.pathname.match(/^\/api\/media\/([a-f0-9]{32})(\/preview)?$/);
 if(mediaRoute){
  const media=db.prepare('SELECT * FROM media WHERE id=? AND COALESCE(hidden,0)=0').get(mediaRoute[1]);
  if(!media)return json(res,404,{error:'Video không còn trong thư viện'});
  if(req.method==='DELETE' && !mediaRoute[2]){
   if(db.prepare("SELECT id FROM jobs WHERE media_id=? AND status IN ('queued','running','processing','review','remote_queued','remote_uploading','remote_confirming')").get(media.id))return json(res,409,{error:'Video đang có lịch đăng hoặc bài cần kiểm tra. Hủy lịch chờ và xử lý bài đang đăng trước khi xóa.'});
   db.prepare('UPDATE media SET hidden=1 WHERE id=?').run(media.id);
   return json(res,200,{ok:true});
  }
  if(req.method==='GET' && mediaRoute[2]){
   if(media.path)await checkUnchanged(media);
   let start=0,end=media.size-1;
   if(req.headers.range){
    const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!range || (!range[1] && !range[2])){res.writeHead(416,{'Content-Range':`bytes */${media.size}`});return res.end();}
    start=range[1]?Number(range[1]):Math.max(0,media.size-Number(range[2]));
    end=range[1] && range[2]?Math.min(Number(range[2]),end):end;
    if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=media.size){res.writeHead(416,{'Content-Range':`bytes */${media.size}`});return res.end();}
   }
   const stream=createReadStream(media.path || `${root}/${media.id}`,{start,end});
   stream.on('error',()=>{if(!res.headersSent)json(res,404,{error:'Không đọc được video'});else res.destroy();});
   stream.once('open',()=>{
    res.writeHead(req.headers.range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store',...(req.headers.range?{'Content-Range':`bytes ${start}-${end}/${media.size}`}:{})});stream.pipe(res);
   });
   res.on('close',()=>stream.destroy());return;
  }
 }
 if(url.pathname==='/api/jobs/batch' && req.method==='POST'){
  const input=JSON.parse(await body(req));
  const remote=input.remote===true;
  if(remote && !config())throw Error('Cấu hình Meta chưa đầy đủ');
  if(remote && db.prepare("SELECT id FROM jobs WHERE status IN ('remote_queued','remote_uploading','remote_confirming') LIMIT 1").get())throw Error('Một lượt tải lên Meta đang chạy. Đợi lượt đó hoàn tất trước khi gửi thêm.');
  if(!db.prepare('SELECT id FROM pages WHERE id=?').get(input.pageId || ''))throw Error('Chọn Page đã kết nối');
  const custom=Array.isArray(input.items);
  if(custom)input.mediaIds=input.items.map(item=>item?.mediaId);
  if(!Array.isArray(input.mediaIds) || !input.mediaIds.length || input.mediaIds.length>1000 || input.mediaIds.some(id=>typeof id!=='string') || new Set(input.mediaIds).size!==input.mediaIds.length)throw Error('Chọn từ 1 đến 1000 video khác nhau');
  const start=new Date(input.due).getTime(),interval=input.intervalMinutes;
  if(!custom && (!Number.isFinite(start) || start<=Date.now() || !Number.isInteger(interval) || interval<1 || interval>525600 || typeof input.caption!=='string' || input.caption.length>2200))throw Error('Chọn giờ bắt đầu trong tương lai, khoảng cách 1–525600 phút và caption tối đa 2200 ký tự');
  const items=custom?input.items:input.mediaIds.map((mediaId,index)=>({mediaId,caption:input.caption,due:new Date(start+index*interval*60000).toISOString()}));
  const now=Date.now();
  for(const item of items){
   if(typeof item.caption!=='string' || item.caption.length>2200 || (!item.now && (!Number.isFinite(Date.parse(item.due)) || Date.parse(item.due)<=now)) || (item.now!==undefined && typeof item.now!=='boolean'))throw Error('Mỗi video cần caption tối đa 2200 ký tự và giờ đăng trong tương lai hoặc chọn Đăng ngay');
   item.due=item.now?new Date(now).toISOString():new Date(item.due).toISOString();
   if(remote && !item.now && Date.parse(item.due)<now+15*60000)throw Error('Lịch trên Facebook phải bắt đầu ít nhất 15 phút sau thời điểm bấm đăng. Với nhiều video, hãy chừa thêm thời gian upload.');
  }
  for(const id of input.mediaIds){
   const media=db.prepare('SELECT * FROM media WHERE id=? AND COALESCE(hidden,0)=0').get(id);
   if(!media)throw Error('Video đã bị xóa khỏi thư viện. Hãy làm mới danh sách.');
   if(media.path)await checkUnchanged(media);
  }
  db.exec('BEGIN');
  const batchId=remote?randomBytes(16).toString('hex'):null;
  try{
   for(const [index,id] of input.mediaIds.entries()){
    if(!db.prepare('SELECT id FROM media WHERE id=? AND COALESCE(hidden,0)=0').get(id))throw Error('Thư viện đã thay đổi. Hãy làm mới danh sách.');
    const conflict=db.prepare("SELECT jobs.status,media.name FROM jobs JOIN media ON media.id=jobs.media_id WHERE page_id=? AND media_id=? AND status IN ('queued','running','processing','review','remote_queued','remote_uploading','remote_confirming','remote_scheduled') LIMIT 1").get(input.pageId,id);
    if(conflict)throw Error(`Video "${conflict.name}" còn bài ${conflict.status==='review'?'Cần kiểm tra':'đang chờ hoặc đang xử lý'} trên Page này. Lịch đã hủy không chặn đăng lại. Chưa tạo lịch nào; xử lý bài này trong Lịch xuất bản.`);
    if(remote)db.prepare('INSERT INTO jobs(id,page_id,media_id,caption,due,status,created,batch_id,progress,remote_now) VALUES(?,?,?,?,?,?,?,?,0,?)').run(randomBytes(16).toString('hex'),input.pageId,id,items[index].caption,items[index].due,'remote_queued',new Date().toISOString(),batchId,items[index].now?1:0);
    else db.prepare('INSERT INTO jobs(id,page_id,media_id,caption,due,created) VALUES(?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),input.pageId,id,items[index].caption,items[index].due,new Date().toISOString());
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  if(remote)setImmediate(()=>tick().catch(()=>console.error('Worker gặp lỗi nội bộ')));
  return json(res,201,{ok:true,count:input.mediaIds.length,batchId});
 }
 if(url.pathname==='/api/jobs' && req.method==='POST'){
  const input=JSON.parse(await body(req));if(!db.prepare('SELECT id FROM pages WHERE id=?').get(input.pageId || '') || !db.prepare('SELECT id FROM media WHERE id=? AND COALESCE(hidden,0)=0').get(input.mediaId || ''))throw new Error('Chọn Page đã kết nối và video');
  const selected=db.prepare('SELECT * FROM media WHERE id=?').get(input.mediaId);if(selected.path)await checkUnchanged(selected);
  const due=new Date(input.due || Date.now());if(!Number.isFinite(due.getTime()) || typeof input.caption!=='string' || input.caption.length>2200)throw new Error('Lịch đăng hoặc caption không hợp lệ');
  db.prepare('INSERT INTO jobs(id,page_id,media_id,caption,due,created) VALUES(?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),input.pageId,input.mediaId,input.caption,due.toISOString(),new Date().toISOString());return json(res,201,{ok:true});
 }
 const clearReview=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})\/clear-review$/);
 if(clearReview && req.method==='POST'){
  const input=JSON.parse(await body(req));if(input.confirmed!==true)throw Error('Cần xác nhận đã kiểm tra bài trên Facebook');
  const result=db.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status='review'").run(clearReview[1]);
  return json(res,result.changes?200:409,{ok:!!result.changes,error:result.changes?undefined:'Trạng thái bài đã thay đổi; hãy làm mới danh sách'});
 }
 if(url.pathname==='/api/jobs/history' && req.method==='DELETE'){
  const result=db.prepare("DELETE FROM jobs WHERE status IN ('published','cancelled')").run();
  return json(res,200,{ok:true,count:result.changes});
 }
 if(url.pathname.startsWith('/api/jobs/') && req.method==='DELETE'){
  const result=db.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status IN ('queued','remote_queued')").run(url.pathname.split('/').pop());return json(res,result.changes?200:409,{ok:!!result.changes});
 }
 if(req.method==='GET' && ['/', '/app.js','/quick.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'X-Content-Type-Options':'nosniff'});return res.end(readFileSync(fileURLToPath(new URL(`./public/${file}`,import.meta.url))));}
 json(res,404,{error:'Không tìm thấy'});
 }catch(error){json(res,400,{error:error.message});}});
let busy=false;
async function tick(){if(busy || !config())return;busy=true;try{
 const remote=db.prepare("SELECT * FROM jobs WHERE status='remote_queued' ORDER BY created,id LIMIT 1").get();
 if(remote){
  db.prepare("UPDATE jobs SET status='remote_uploading',progress=0 WHERE id=? AND status='remote_queued'").run(remote.id);
  try{
   const page=db.prepare('SELECT * FROM pages WHERE id=?').get(remote.page_id),token=crypt(page.token,true);
   const media=db.prepare('SELECT * FROM media WHERE id=?').get(remote.media_id);
   if(media.path)await checkUnchanged(media);
   if(!remote.remote_now && Date.parse(remote.due)<Date.now()+15*60000)throw Error('Giờ hẹn quá gần sau khi đợi upload. Chưa gửi lịch lên Meta.');
   const started=await meta.begin(page.id,token);
   if(!started.video_id || !started.upload_url)throw Error('Meta không trả về phiên upload');
   db.prepare('UPDATE jobs SET video_id=? WHERE id=?').run(String(started.video_id),remote.id);
   let previous=0;const stream=createReadStream(media.path || `${root}/${remote.media_id}`);
   try{await meta.upload(started.upload_url,token,stream,media.size,(sent,size)=>{
    const progress=Math.min(95,Math.floor(sent/size*95));
    if(progress>previous){previous=progress;db.prepare('UPDATE jobs SET progress=? WHERE id=?').run(progress,remote.id);}
   });}finally{stream.destroy();}
   db.prepare("UPDATE jobs SET status='remote_confirming',progress=96 WHERE id=?").run(remote.id);
   if(!remote.remote_now && Date.parse(remote.due)<Date.now()+10*60000)throw Error('Upload xong nhưng giờ hẹn đã quá gần. Kiểm tra video trên Facebook trước khi lên lịch lại.');
   const result=remote.remote_now?await meta.finish(page.id,token,started.video_id,remote.caption):await meta.schedule(page.id,token,started.video_id,remote.caption,remote.due);
   if(!result.success)throw Error('Meta chưa xác nhận lịch đăng');
   db.prepare('UPDATE jobs SET status=?,progress=100,error=NULL WHERE id=?').run(remote.remote_now?'processing':'remote_scheduled',remote.id);
  }catch(error){
   db.prepare("UPDATE jobs SET status='review',error=? WHERE id=?").run(`${error.message} Kiểm tra video trên Facebook trước khi thử lại.`,remote.id);
  }
  return;
 }
 const pending=db.prepare("SELECT * FROM jobs WHERE status='processing' LIMIT 1").get();
 if(pending){const p=db.prepare('SELECT * FROM pages WHERE id=?').get(pending.page_id);try{const result=await meta.status(pending.video_id,crypt(p.token,true));if(result.status?.video_status==='ready')db.prepare("UPDATE jobs SET status='published',error=NULL WHERE id=?").run(pending.id);else if(result.status?.video_status==='error')db.prepare("UPDATE jobs SET status='review',error='Meta xử lý video thất bại; kiểm tra trên Facebook.' WHERE id=?").run(pending.id);}catch{db.prepare("UPDATE jobs SET error='Chưa kiểm tra được trạng thái Meta; worker sẽ kiểm tra lại.' WHERE id=?").run(pending.id);}}
 const job=db.prepare("SELECT * FROM jobs WHERE status='queued' AND due<=? ORDER BY due LIMIT 1").get(new Date().toISOString());if(!job)return;
 db.prepare("UPDATE jobs SET status='running' WHERE id=? AND status='queued'").run(job.id);
 try{const p=db.prepare('SELECT * FROM pages WHERE id=?').get(job.page_id),token=crypt(p.token,true);const media=db.prepare('SELECT * FROM media WHERE id=?').get(job.media_id);if(media.path)await checkUnchanged(media);
 const started=await meta.begin(p.id,token);if(!started.video_id || !started.upload_url)throw new Error('Meta không trả về phiên upload');db.prepare('UPDATE jobs SET video_id=? WHERE id=?').run(String(started.video_id),job.id);const stream=createReadStream(media.path || `${root}/${job.media_id}`);try{await meta.upload(started.upload_url,token,stream,media.size);}finally{stream.destroy();}const finished=await meta.finish(p.id,token,started.video_id,job.caption);if(!finished.success)throw new Error('Meta chưa xác nhận yêu cầu đăng');db.prepare("UPDATE jobs SET status='processing' WHERE id=?").run(job.id);
 }catch(error){db.prepare("UPDATE jobs SET status='review',error=? WHERE id=?").run(`${error.message} Kiểm tra Facebook trước khi tạo lại lịch.`,job.id);}
 }finally{busy=false;if(db.prepare("SELECT id FROM jobs WHERE status='remote_queued' LIMIT 1").get())setImmediate(()=>tick().catch(()=>console.error('Worker gặp lỗi nội bộ')));}}
setInterval(()=>tick().catch(()=>console.error('Worker gặp lỗi nội bộ')),15000).unref();
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>{console.log(`Reels Desk listening on port ${server.address().port}`);if(process.send)process.send({type:'ready',port:server.address().port});});
