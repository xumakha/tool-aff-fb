const $=id=>document.getElementById(id);
const labels={eligible:'Đủ điều kiện',already:'Page đã bình luận',unmatched:'Không khớp sản phẩm',ambiguous:'Khớp nhiều dòng',invalid:'Nội dung/link chưa hợp lệ',unknown:'Chưa kiểm tra chắc chắn',changed:'Bài đã thay đổi',sending:'Đang gửi',posted:'Đã bình luận',uncertain:'Cần kiểm tra Facebook',rejected:'Meta từ chối'};
let runId=null,offset=0,snapshot=null,busy=false,fetching=false,refreshQueued=false;
const selected=new Set();
async function request(url,input){const response=await fetch(url,input===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const data=await response.json();if(!response.ok)throw Error(data.error||'Yêu cầu thất bại.');return data;}
function error(message){$('error').hidden=!message;$('error').textContent=message||'';}
function controls(){
 const active=!!snapshot?.activeId,samePage=$('page').value===snapshot?.run?.page_id;
 $('scan').disabled=busy||active;$('page').disabled=busy||active;$('scan-limit').disabled=busy||active;
 $('start').disabled=busy||active||!samePage||!selected.size||!['ready','done','stopped'].includes(snapshot?.run?.status);
 $('stop').disabled=busy||!active;$('select-page').disabled=busy||active||!samePage||!snapshot?.items.some(item=>item.status==='eligible');
 $('selection').textContent=`${selected.size} bài được chọn`;
}
async function pages(){try{const data=await request('/api/state'),previous=$('page').value;$('page').replaceChildren(new Option('Chọn Page',''));for(const page of data.pages)$('page').append(new Option(page.name,page.id));$('page').value=previous||snapshot?.run?.page_id||'';if(!data.pages.length)error('Chưa có Page. Kết nối Facebook ở tab Ứng dụng trước.');if(snapshot)render(snapshot);else controls();}catch(e){error(e.message);}}
function render(data){
 snapshot=data;if(data.run)runId=data.run.id;
 $('run-message').textContent=data.run?`${data.run.page_name} · ${data.run.message}`:'Chưa có lượt quét.';
 $('summary').textContent=Object.entries(data.counts).map(([key,count])=>`${labels[key]||key}: ${count}`).join(' · ');
 const fragment=document.createDocumentFragment();
 for(const item of data.items){
  if(item.status!=='eligible')selected.delete(item.post_id);
  const tr=document.createElement('tr'),checkCell=document.createElement('td'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.disabled=item.status!=='eligible'||!!data.activeId||$('page').value!==data.run?.page_id;checkbox.checked=selected.has(item.post_id);checkbox.setAttribute('aria-label','Chọn bài '+item.post_id);checkbox.onchange=()=>{checkbox.checked?selected.add(item.post_id):selected.delete(item.post_id);controls();};checkCell.append(checkbox);tr.append(checkCell);
  const post=document.createElement('td'),id=document.createElement('span');id.className='comment-post-id';id.textContent=item.post_id;post.append(id,document.createTextNode(item.caption));tr.append(post);
  if(item.post_url){const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Sao chép link bài';copy.onclick=async()=>{try{await navigator.clipboard.writeText(item.post_url);copy.textContent='Đã sao chép';}catch{error('Link bài viết: '+item.post_url);}};post.append(document.createElement('br'),copy);}
  const name=document.createElement('td');name.textContent=item.name+(item.excel_row?'\nDòng '+item.excel_row:'');tr.append(name);
  const message=document.createElement('td');message.textContent=item.message;tr.append(message);
  const status=document.createElement('td'),title=document.createElement('span'),reason=document.createElement('span');title.className='comment-status';title.textContent=labels[item.status]||item.status;reason.className='comment-reason';reason.textContent=item.reason+(item.comment_id?'\nID bình luận: '+item.comment_id:'');status.append(title,reason);tr.append(status);fragment.append(tr);
 }
 if(!data.items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='Chưa có bài để hiển thị.';tr.append(td);fragment.append(tr);}
 $('items').replaceChildren(fragment);offset=data.offset||0;$('page-status').textContent=data.total?`Trang ${Math.floor(offset/100)+1} / ${Math.ceil(data.total/100)} · ${data.total} bài`:'';
 $('previous').disabled=offset===0;$('next').disabled=offset+100>=(data.total||0);controls();
}
async function refresh(){
 if(fetching){refreshQueued=true;return;}fetching=true;const requestedId=runId,requestedOffset=offset;
 try{const params=new URLSearchParams({offset:requestedOffset,...(requestedId?{id:requestedId}:{})});const data=await request('/api/affiliate-comments?'+params);if(runId!==requestedId||offset!==requestedOffset){refreshQueued=true;return;}render(data);}
 catch(e){error(e.message);}finally{fetching=false;if(refreshQueued){refreshQueued=false;void refresh();}}
}
$('scan-form').onsubmit=async event=>{event.preventDefault();busy=true;error('');controls();try{const result=await request('/api/affiliate-comments/scan',{pageId:$('page').value,limit:Number($('scan-limit').value)});runId=result.runId;offset=0;selected.clear();await refresh();}catch(e){error(e.message);}finally{busy=false;controls();}};
$('start').onclick=async()=>{
 if(!selected.size||!confirm(`Đăng ${selected.size} bình luận đã chọn dưới danh nghĩa Page “${snapshot.run.page_name}”? Nội dung sẽ dùng đúng các dòng xem trước.`))return;
 busy=true;error('');controls();try{await request('/api/affiliate-comments/start',{runId,postIds:[...selected],confirmed:true,interval:Number($('interval').value)});selected.clear();await refresh();}catch(e){error(e.message);}finally{busy=false;controls();}
};
$('stop').onclick=async()=>{busy=true;controls();try{await request('/api/affiliate-comments/stop',{runId:snapshot.activeId});await refresh();}catch(e){error(e.message);}finally{busy=false;controls();}};
$('select-page').onclick=()=>{for(const item of snapshot?.items||[])if(item.status==='eligible')selected.add(item.post_id);render(snapshot);};
$('clear-selection').onclick=()=>{selected.clear();if(snapshot)render(snapshot);};
$('previous').onclick=()=>{offset=Math.max(0,offset-100);refresh();};$('next').onclick=()=>{offset+=100;refresh();};
$('page').onchange=()=>{selected.clear();if(snapshot)render(snapshot);else controls();};$('refresh-pages').onclick=pages;
await refresh();await pages();setInterval(refresh,2000);
