import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readMasterRows} from './master-view.mjs';

const normalize=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
const validID=value=>typeof value==='string'&&/^\d+(?:_\d+)*$/.test(value);
function affiliateLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['shopee.vn','shope.ee','shopee.com.vn'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}}
export function matchProduct(caption,rows){
 const lines=String(caption||'').trim().split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
 const withoutTrailer=[...lines];while(withoutTrailer.length&&/^(?:https?:\/\/\S+|#[\p{L}\p{N}_]+)(?:\s+(?:https?:\/\/\S+|#[\p{L}\p{N}_]+))*$/u.test(withoutTrailer.at(-1)))withoutTrailer.pop();
 const names=new Set([normalize(caption),normalize(lines[0]),normalize(withoutTrailer.join(' '))].filter(Boolean));
 const matches=rows.filter(row=>names.has(normalize(row.cells[1])));
 if(!matches.length)return {status:'unmatched',reason:'Caption không khớp chính xác tên sản phẩm trong Excel.'};
 const variants=new Set(matches.map(row=>JSON.stringify([normalize(row.cells[1]),row.cells[2],row.cells[3]])));
 if(variants.size!==1)return {status:'ambiguous',reason:'Khớp nhiều dòng Excel có tên/link/nội dung khác nhau.'};
 const row=matches[0],message=row.cells[3],link=row.cells[2].trim();
 if(!message.trim()||!affiliateLink(link)||!message.includes(link))return {status:'invalid',reason:'Cột Nội dung trống hoặc chưa chứa link affiliate hợp lệ ở cột C.'};
 if(message.length>20000)return {status:'invalid',reason:'Nội dung vượt giới hạn 20.000 ký tự của tool.'};
 return {status:'eligible',name:row.cells[1],excelRow:row.row,message};
}

export class CommentGraph {
 constructor(meta,token,{shouldStop=()=>false}={}){this.meta=meta;this.token=token;this.shouldStop=shouldStop;}
 check(){if(this.shouldStop())throw Object.assign(Error('Đã yêu cầu dừng.'),{stopped:true});}
 async call(path,body){
  this.check();
  try{return await this.meta.request(path,this.token,body);}
  catch(error){
   if(error.metaRejected)throw error;
   throw Object.assign(Error('Không nhận được xác nhận từ Meta. Kiểm tra mạng và trạng thái trên Facebook.'),{uncertain:!!body});
  }
 }
 async *edge(id,edge,fields,{maxPages=100,params={}}={}){
  if(!validID(id))throw Error('ID đối tượng Meta không hợp lệ.');
  const seen=new Set();let after;
  for(let page=0;page<maxPages;page++){
   const query=new URLSearchParams({fields,limit:'100',...params,...(after?{after}:{})});
   const result=await this.call(`${id}/${edge}?${query}`);
   if(!Array.isArray(result.data))throw Error('Meta chưa trả đủ dữ liệu để kiểm tra.');
   yield result;
   if(!result.paging?.next)return;
   after=result.paging?.cursors?.after;
   if(typeof after!=='string'||!after||seen.has(after))throw Error('Không đọc được trang dữ liệu tiếp theo của Meta.');
   seen.add(after);
  }
  throw Error('Dữ liệu vượt giới hạn phân trang; chưa thể kết luận đã kiểm tra hết.');
 }
 async post(id){
  if(!validID(id))throw Error('ID bài viết không hợp lệ.');
  return this.call(`${id}?fields=id,message,from,is_published,permalink_url`);
 }
 async ownComment(postId,pageId){
  let unknown=false,checked=0;const queue=[{id:postId,depth:0}],seen=new Set();
  while(queue.length){
   const {id,depth}=queue.shift();let count=0,total=0;
   if(depth>20)throw Error('Luồng trả lời quá sâu; chưa kiểm tra hết bình luận.');
   for await(const result of this.edge(id,'comments','id,from,comment_count',{params:{filter:'toplevel',order:'chronological',summary:'true'}})){
    total=Math.max(total,Number(result.summary?.total_count)||0);
    for(const comment of result.data){
     this.check();if(++checked>10000)throw Error('Bài có quá nhiều bình luận; chưa kiểm tra hết.');
     if(!validID(comment.id))throw Error('Meta trả bình luận không có ID hợp lệ.');
     if(seen.has(comment.id))throw Error('Meta trả dữ liệu bình luận lặp; chưa thể xác nhận đầy đủ.');
     seen.add(comment.id);count++;
     if(String(comment.from?.id||'')===pageId)return {own:true};
     if(!comment.from?.id)unknown=true;
     if(comment.comment_count!==0)queue.push({id:comment.id,depth:depth+1});
    }
   }
   if(total>count)unknown=true;
  }
  return {own:false,unknown};
 }
 async comment(id,message){if(!validID(id))throw Error('ID bài viết không hợp lệ.');return this.call(`${id}/comments`,{message});}
}

const now=()=>new Date().toISOString();
export function createCommentService({db,meta,getPage,masterFile,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 db.exec(`CREATE TABLE IF NOT EXISTS affiliate_comment_runs(id TEXT PRIMARY KEY,page_id TEXT,page_name TEXT,status TEXT,created TEXT,updated TEXT,master_hash TEXT,stop_requested INTEGER DEFAULT 0,message TEXT);
 CREATE TABLE IF NOT EXISTS affiliate_comment_items(run_id TEXT,post_id TEXT,caption TEXT,post_url TEXT,name TEXT,excel_row INTEGER,message TEXT,status TEXT,reason TEXT,comment_id TEXT,PRIMARY KEY(run_id,post_id));
 CREATE TABLE IF NOT EXISTS affiliate_comment_receipts(page_id TEXT,post_id TEXT,status TEXT,comment_id TEXT,message TEXT,updated TEXT,PRIMARY KEY(page_id,post_id));`);
 db.exec("UPDATE affiliate_comment_receipts SET status='uncertain' WHERE status='sending';UPDATE affiliate_comment_items SET status='uncertain',reason='App dừng khi đang gửi. Kiểm tra trên Facebook trước khi thử lại.' WHERE status='sending';UPDATE affiliate_comment_runs SET status='interrupted',message='Lượt trước bị gián đoạn. Quét lại trước khi tiếp tục.' WHERE status IN ('scanning','running','stopping')");
 let active=null;
 const run=id=>db.prepare('SELECT * FROM affiliate_comment_runs WHERE id=?').get(id);
 const updateRun=(id,status,message)=>db.prepare('UPDATE affiliate_comment_runs SET status=?,message=?,updated=? WHERE id=?').run(status,message,now(),id);
 const updateItem=(runId,postId,status,reason='',commentId=null)=>db.prepare('UPDATE affiliate_comment_items SET status=?,reason=?,comment_id=? WHERE run_id=? AND post_id=?').run(status,reason,commentId,runId,postId);
 const receipt=(pageId,postId)=>db.prepare('SELECT * FROM affiliate_comment_receipts WHERE page_id=? AND post_id=?').get(pageId,postId);
 const stopped=id=>!!run(id)?.stop_requested;
 const hash=async()=>createHash('sha256').update(await readFile(masterFile)).digest('hex');
 async function workbook(){const fingerprint=await hash(),data=await readMasterRows(masterFile);if(await hash()!==fingerprint)throw Error('File tổng vừa thay đổi. Quét lại sau khi ghi file xong.');if(data.headers.some((name,i)=>name!==['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung'][i]))throw Error('File tổng phải có đúng 4 cột: Liên kết gốc, Tên sản phẩm, Link affiliate, Nội dung.');if(!data.rows.length)throw Error('File tổng chưa có dữ liệu affiliate.');return {...data,hash:fingerprint};}
 const credentials=pageId=>{const page=getPage(pageId);if(!page||!validID(page.id))throw Error('Chọn Page đã kết nối.');return page;};
 function launch(id,task){
  active=id;
  void task().catch(error=>updateRun(id,error.stopped?'stopped':'failed',error.message)).finally(()=>{if(active===id)active=null;});
 }
 function snapshot(id,offset=0){
  const current=id?run(id):db.prepare('SELECT * FROM affiliate_comment_runs ORDER BY created DESC LIMIT 1').get();
  if(!current)return {run:null,items:[],counts:{},activeId:active};
  const counts={};for(const row of db.prepare('SELECT status,COUNT(*) AS count FROM affiliate_comment_items WHERE run_id=? GROUP BY status').all(current.id))counts[row.status]=row.count;
  const total=Object.values(counts).reduce((sum,n)=>sum+n,0);offset=Math.max(0,Math.floor(Number(offset)||0));offset=Math.min(offset,Math.max(0,Math.floor((total-1)/100)*100));
  const items=db.prepare('SELECT * FROM affiliate_comment_items WHERE run_id=? ORDER BY rowid LIMIT 100 OFFSET ?').all(current.id,offset);
  const {master_hash,...safe}=current;return {run:safe,items,counts,total,offset,pageSize:100,activeId:active};
 }
 function eligibleIds(id){
  const current=run(id);
  if(active||!current||!['ready','done','stopped'].includes(current.status))throw Error('Hãy đợi lượt quét hoàn tất trước khi chọn tất cả bài.');
  credentials(current.page_id);
  return {runId:id,pageId:current.page_id,postIds:db.prepare("SELECT post_id FROM affiliate_comment_items WHERE run_id=? AND status='eligible' ORDER BY rowid").all(id).map(item=>item.post_id)};
 }
 async function scan({pageId,limit=100}){
  if(active)throw Error('Đang có lượt quét/bình luận. Hãy đợi hoặc dừng lượt hiện tại.');
  if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Giới hạn quét từ 1 đến 5.000 bài.');
  const page=credentials(pageId),id=randomUUID();
  db.prepare('INSERT INTO affiliate_comment_runs(id,page_id,page_name,status,created,updated,message) VALUES(?,?,?,?,?,?,?)').run(id,page.id,page.name,'scanning',now(),now(),'Đang đọc Excel và bài đã xuất bản…');
  launch(id,async()=>{
   const book=await workbook();db.prepare('UPDATE affiliate_comment_runs SET master_hash=? WHERE id=?').run(book.hash,id);
   const graph=new CommentGraph(meta,page.token,{shouldStop:()=>stopped(id)}),seen=new Set();let count=0,truncated=false;
   scanPosts:for await(const batch of graph.edge(page.id,'published_posts','id,message,from,is_published,permalink_url,created_time',{params:{order:'reverse_chronological',limit:String(Math.min(limit,100))}})){
    for(const post of batch.data){
     graph.check();if(!validID(post.id)||seen.has(post.id))continue;seen.add(post.id);
     if(count>=limit){truncated=true;break scanPosts;}count++;
     let match=matchProduct(post.message,book.rows),status=match.status,reason=match.reason||'';
     const old=receipt(page.id,post.id);
     if(old&&['posted','sending','uncertain'].includes(old.status)){status=old.status==='posted'?'already':'uncertain';reason=old.status==='posted'?'Đã có lịch sử bình luận thành công.':'Lần gửi trước chưa rõ kết quả; cần kiểm tra trên Facebook.';}
     else if(String(post.from?.id||'')!==page.id||post.is_published===false){status='unknown';reason='Chưa xác nhận bài đã xuất bản bởi chính Page.';}
     else if(status==='eligible'){
      try{const checked=await graph.ownComment(post.id,page.id);if(checked.own){status='already';reason='Đã có bình luận hoặc trả lời của Page.';}else if(checked.unknown){status='unknown';reason='Có bình luận thiếu tác giả hoặc Meta chưa trả đủ dữ liệu.';}}
      catch(error){if(error.stopped)throw error;status=error.requiredPermissions?.includes('pages_read_user_content')?'permission':'unknown';reason=error.message;}
     }
     db.prepare('INSERT INTO affiliate_comment_items VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,post.id,post.message||'',post.permalink_url||'',match.name||'',match.excelRow||null,match.message||'',status,reason,null);
     updateRun(id,'scanning',`Đã đối chiếu ${count} bài…`);
    }
    if(count>=limit){truncated=truncated||!!batch.paging?.next;break;}
   }
   updateRun(id,'ready',`Đã quét ${count} bài API trả về.${truncated?' Còn bài chưa quét; tăng giới hạn để xem thêm.':''} Chọn các bài đủ điều kiện để bình luận.`);
  });
  return {runId:id};
 }
 async function start({runId,postIds,confirmed,interval=5}){
  if(active)throw Error('Đang có lượt quét/bình luận khác.');
  const current=run(runId);if(!current||!['ready','done','stopped'].includes(current.status))throw Error('Hãy quét và xem trước trước khi bình luận.');
  if(confirmed!==true)throw Error('Cần xác nhận các bình luận đã chọn.');
  if(!Array.isArray(postIds)||!postIds.length||postIds.length>5000||new Set(postIds).size!==postIds.length||postIds.some(id=>!validID(id)))throw Error('Chọn các bài đủ điều kiện để bình luận.');
  if(!Number.isInteger(interval)||interval<5||interval>300)throw Error('Khoảng cách bình luận từ 5 đến 300 giây.');
  const items=postIds.map(postId=>db.prepare('SELECT * FROM affiliate_comment_items WHERE run_id=? AND post_id=?').get(runId,postId));
  if(items.some(item=>!item||item.status!=='eligible'))throw Error('Danh sách đã thay đổi hoặc có bài không đủ điều kiện. Hãy làm mới.');
  const page=credentials(current.page_id);
  // Reserve this run before any await so double-clicks cannot launch two sends.
  active=runId;
  db.prepare('UPDATE affiliate_comment_runs SET stop_requested=0 WHERE id=?').run(runId);
  let book;try{book=await workbook();if(book.hash!==current.master_hash)throw Error('Excel tổng đã thay đổi sau khi quét. Hãy quét lại để xem nội dung mới.');if(stopped(runId))throw Object.assign(Error('Đã yêu cầu dừng.'),{stopped:true});}catch(error){active=null;if(error.stopped)updateRun(runId,'stopped',error.message);throw error;}
  updateRun(runId,'running','Đang kiểm tra lại và gửi bình luận đã chọn…');
  launch(runId,async()=>{
   const graph=new CommentGraph(meta,page.token,{shouldStop:()=>stopped(runId)});
   for(let index=0;index<items.length;index++){
    graph.check();const item=items[index];
    const old=receipt(page.id,item.post_id);
    if(old&&['posted','sending','uncertain'].includes(old.status)){updateItem(runId,item.post_id,old.status==='posted'?'already':'uncertain','Đã có lịch sử gửi; bỏ qua để chống trùng.');continue;}
    try{
     const post=await graph.post(item.post_id),matched=matchProduct(post.message,book.rows);
     if(post.id!==item.post_id||String(post.from?.id||'')!==page.id||post.is_published===false||matched.status!=='eligible'||matched.message!==item.message||normalize(matched.name)!==normalize(item.name)){updateItem(runId,item.post_id,'changed','Bài viết hoặc kết quả đối chiếu đã thay đổi. Hãy quét lại.');continue;}
     const checked=await graph.ownComment(item.post_id,page.id);
     if(checked.own){updateItem(runId,item.post_id,'already','Page đã bình luận sau lượt quét; bỏ qua.');continue;}
     if(checked.unknown){updateItem(runId,item.post_id,'unknown','Chưa xác nhận đủ tác giả bình luận.');continue;}
    }catch(error){if(error.stopped)throw error;updateItem(runId,item.post_id,error.requiredPermissions?.includes('pages_read_user_content')?'permission':'unknown',error.message);continue;}
    graph.check();
    db.prepare('INSERT INTO affiliate_comment_receipts VALUES(?,?,?,?,?,?) ON CONFLICT(page_id,post_id) DO UPDATE SET status=excluded.status,comment_id=NULL,message=excluded.message,updated=excluded.updated').run(page.id,item.post_id,'sending',null,item.message,now());
    updateItem(runId,item.post_id,'sending','Đang chờ Meta xác nhận…');
    try{
     const result=await graph.comment(item.post_id,item.message);
     if(!validID(result.id))throw Object.assign(Error('Meta chưa trả ID bình luận. Kiểm tra trên Facebook.'),{uncertain:true});
     db.prepare('UPDATE affiliate_comment_receipts SET status=?,comment_id=?,updated=? WHERE page_id=? AND post_id=?').run('posted',result.id,now(),page.id,item.post_id);
     updateItem(runId,item.post_id,'posted','Meta đã trả ID bình luận.',result.id);
    }catch(error){
     const status=error.metaRejected?'rejected':'uncertain';
     db.prepare('UPDATE affiliate_comment_receipts SET status=?,updated=? WHERE page_id=? AND post_id=?').run(status,now(),page.id,item.post_id);
     updateItem(runId,item.post_id,status,error.message);
     // Stop on a rejection or uncertain write. Never automatically retry a POST.
     updateRun(runId,status==='uncertain'?'review':'failed','Đã dừng: '+error.message);return;
    }
    updateRun(runId,'running',`Đã xử lý ${index+1}/${items.length} bài đã chọn.`);
    if(index<items.length-1){const delay=randomCommentInterval(interval)*1000;for(let waited=0;waited<delay;waited+=250){graph.check();await sleep(250);}}
   }
   updateRun(runId,'done','Đã xử lý xong các bài đã chọn.');
  });
  return {runId};
 }
 function stop(id){if(active!==id)throw Error('Lượt này không còn chạy.');db.prepare('UPDATE affiliate_comment_runs SET stop_requested=1,status=?,message=? WHERE id=?').run('stopping','Sẽ dừng sau yêu cầu Meta đang xử lý.',id);return {ok:true};}
 return {scan,start,stop,snapshot,eligibleIds};
}
export function randomCommentInterval(interval,random=Math.random){return Math.max(5,interval+Math.floor(random()*21)-10);}
