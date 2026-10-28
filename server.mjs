import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {Meta} from './meta.mjs';
if (process.env.HOST && !['127.0.0.1','localhost','::1'].includes(process.env.HOST) && !process.env.ADMIN_PASSWORD) throw new Error('Cần ADMIN_PASSWORD khi mở ứng dụng ra mạng');
const root = process.env.DATA_DIR || 'data'; mkdirSync(root,{recursive:true});
const db = new DatabaseSync(`${root}/reels.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY,name TEXT,token TEXT); CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,name TEXT,size INTEGER); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,page_id TEXT,media_id TEXT,caption TEXT,due TEXT,status TEXT DEFAULT 'queued',video_id TEXT,error TEXT,created TEXT);`);
// An interrupted publish must be reconciled, never blindly repeated.
db.exec("UPDATE jobs SET status='review',error='Worker bị gián đoạn. Kiểm tra trên Facebook trước khi thử lại.' WHERE status='running'");
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
 if(req.method!=='GET' && req.headers.origin && req.headers.origin!==new URL(base).origin)return json(res,403,{error:'Origin không hợp lệ'});
 if(req.method==='GET' && url.pathname==='/api/state')return json(res,200,{configured:config(),pages:db.prepare('SELECT id,name FROM pages').all(),media:db.prepare('SELECT * FROM media').all(),jobs:db.prepare('SELECT jobs.*,pages.name AS page_name,media.name AS media_name FROM jobs LEFT JOIN pages ON pages.id=jobs.page_id LEFT JOIN media ON media.id=jobs.media_id ORDER BY due DESC').all()});
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
 if(url.pathname==='/api/media' && req.method==='POST'){
  const name=decodeURIComponent(req.headers['x-file-name'] || 'video.mp4');if(!/\.(mp4|mov)$/i.test(name))throw new Error('Chỉ nhận video MP4 hoặc MOV');
  const bytes=await body(req,100*1024*1024);if(bytes.length<12 || bytes.toString('ascii',4,8)!=='ftyp')throw new Error('Tệp không phải video MP4/MOV hợp lệ');
  const id=randomBytes(16).toString('hex');writeFileSync(`${root}/${id}`,bytes,{mode:0o600});db.prepare('INSERT INTO media VALUES(?,?,?)').run(id,name,bytes.length);return json(res,201,{id});
 }
 if(url.pathname==='/api/jobs' && req.method==='POST'){
  const input=JSON.parse(await body(req));if(!db.prepare('SELECT id FROM pages WHERE id=?').get(input.pageId || '') || !db.prepare('SELECT id FROM media WHERE id=?').get(input.mediaId || ''))throw new Error('Chọn Page đã kết nối và video');
  const due=new Date(input.due || Date.now());if(!Number.isFinite(due.getTime()) || typeof input.caption!=='string' || input.caption.length>2200)throw new Error('Lịch đăng hoặc caption không hợp lệ');
  db.prepare('INSERT INTO jobs(id,page_id,media_id,caption,due,created) VALUES(?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),input.pageId,input.mediaId,input.caption,due.toISOString(),new Date().toISOString());return json(res,201,{ok:true});
 }
 if(url.pathname.startsWith('/api/jobs/') && req.method==='DELETE'){
  const result=db.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status='queued'").run(url.pathname.split('/').pop());return json(res,result.changes?200:409,{ok:!!result.changes});
 }
 if(req.method==='GET' && ['/', '/app.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'X-Content-Type-Options':'nosniff'});return res.end(readFileSync(`public/${file}`));}
 json(res,404,{error:'Không tìm thấy'});
 }catch(error){json(res,400,{error:error.message});}});
let busy=false;
async function tick(){if(busy || !config())return;busy=true;try{
 const pending=db.prepare("SELECT * FROM jobs WHERE status='processing' LIMIT 1").get();
 if(pending){const p=db.prepare('SELECT * FROM pages WHERE id=?').get(pending.page_id);try{const result=await meta.status(pending.video_id,crypt(p.token,true));if(result.status?.video_status==='ready')db.prepare("UPDATE jobs SET status='published',error=NULL WHERE id=?").run(pending.id);else if(result.status?.video_status==='error')db.prepare("UPDATE jobs SET status='review',error='Meta xử lý video thất bại; kiểm tra trên Facebook.' WHERE id=?").run(pending.id);}catch{db.prepare("UPDATE jobs SET error='Chưa kiểm tra được trạng thái Meta; worker sẽ kiểm tra lại.' WHERE id=?").run(pending.id);}}
 const job=db.prepare("SELECT * FROM jobs WHERE status='queued' AND due<=? ORDER BY due LIMIT 1").get(new Date().toISOString());if(!job)return;
 db.prepare("UPDATE jobs SET status='running' WHERE id=? AND status='queued'").run(job.id);
 try{const p=db.prepare('SELECT * FROM pages WHERE id=?').get(job.page_id),token=crypt(p.token,true);const started=await meta.begin(p.id,token);if(!started.video_id || !started.upload_url)throw new Error('Meta không trả về phiên upload');db.prepare('UPDATE jobs SET video_id=? WHERE id=?').run(String(started.video_id),job.id);await meta.upload(started.upload_url,token,readFileSync(`${root}/${job.media_id}`));const finished=await meta.finish(p.id,token,started.video_id,job.caption);if(!finished.success)throw new Error('Meta chưa xác nhận yêu cầu đăng');db.prepare("UPDATE jobs SET status='processing' WHERE id=?").run(job.id);
 }catch(error){db.prepare("UPDATE jobs SET status='review',error=? WHERE id=?").run(`${error.message} Kiểm tra Facebook trước khi tạo lại lịch.`,job.id);}
 }finally{busy=false;}}
setInterval(()=>tick().catch(()=>console.error('Worker gặp lỗi nội bộ')),15000).unref();
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>console.log(`Reels Desk listening on port ${process.env.PORT || 3000}`));
