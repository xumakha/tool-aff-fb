import {createQuickScheduler} from './quick.js';
const $=id=>document.getElementById(id);
const labels={queued:'Chờ đăng',running:'Đang upload',processing:'Meta đang xử lý',published:'Đã xuất bản',review:'Cần kiểm tra',cancelled:'Đã hủy'};
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function request(path,options){const res=await fetch(path,options);const result=await res.json();if(!res.ok)throw new Error(result.error || 'Yêu cầu thất bại');return result;}
let librarySignature='', libraryMedia=[];
$('media').parentElement.insertAdjacentHTML('beforebegin',`<label>Phạm vi lên lịch<select id="schedule-scope"><option value="single">Từng video</option><option value="all">Tất cả video trong thư viện</option></select></label>`);
$('compose-form').querySelector('.hint').insertAdjacentHTML('beforebegin',`<div id="batch-options" hidden><label>Khoảng cách giữa các bài (phút)<input id="interval" type="number" min="1" max="525600" step="1" value="60"></label><p class="hint">Dùng chung Page và caption. Video được xếp theo tên; giờ đầu tiên lấy từ thời gian bạn chọn.</p><p id="batch-summary" role="status"></p></div>`);
const formatTime=value=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
function updateScope(){
 const all=$('schedule-scope').value==='all';
 $('media').disabled=all;$('media').required=!all;$('media').parentElement.hidden=all;
 $('batch-options').hidden=!all;$('interval').disabled=!all;$('interval').required=all;
 if(all)$('mode').value='schedule';$('mode').disabled=all;
 $('due').disabled=$('mode').value==='now';$('due').required=!$('due').disabled;
 const start=new Date($('due').value+':00+07:00').getTime(),gap=Number($('interval').value);
 $('batch-summary').textContent=libraryMedia.length?`${libraryMedia.length} video`+(Number.isFinite(start) && gap>=1?` · Từ ${formatTime(start)} đến ${formatTime(start+(libraryMedia.length-1)*gap*60000)}`:' · Chọn giờ bắt đầu và khoảng cách.'):'Thư viện chưa có video.';
}
$('schedule-scope').onchange=updateScope;$('interval').oninput=updateScope;$('due').oninput=updateScope;
const previewObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const video=entry.target;video.src=video.dataset.src;previewObserver.unobserve(video);}},{rootMargin:'150px'});
function renderLibrary(media){
 const signature=JSON.stringify(media);if(signature===librarySignature)return;librarySignature=signature;previewObserver.disconnect();
 $('media-count').textContent=`${media.length} VIDEO`;
 $('media-list').innerHTML=media.length?media.map(m=>`<article class="video"><div class="thumbnail"><video muted playsinline preload="metadata" data-src="/api/media/${esc(m.id)}/preview" aria-label="Xem trước ${esc(m.name)}"></video><span>Đang tải ảnh…</span></div><strong>${esc(m.name)}</strong><small>${(m.size/1024/1024).toFixed(1)} MB</small><small title="${esc(m.path || '')}">${esc(m.path || 'Video từ bản cũ')}</small><button class="secondary remove-media" data-id="${esc(m.id)}">Xóa khỏi thư viện</button></article>`).join(''):'<p>Chọn thư mục để đưa video vào thư viện. File gốc không bị sao chép.</p>';
 for(const video of $('media-list').querySelectorAll('video')){video.onloadedmetadata=()=>{video.currentTime=Math.min(0.1,video.duration/2 || 0);};video.onloadeddata=()=>{video.nextElementSibling.hidden=true;};video.onerror=()=>{video.nextElementSibling.hidden=false;video.nextElementSibling.textContent='Không có ảnh xem trước';};previewObserver.observe(video);}
}
async function load(){try{const data=await request('/api/state');$('notice').textContent=data.configured?'Đã cấu hình Meta. Kết nối Facebook để tải các Page bạn quản lý.':'Chưa kết nối Meta App. Bạn có thể nhập thư mục video; cấu hình .env trước khi kết nối Facebook và đăng bài thật.';
for(const [key,list] of [['page',data.pages],['media',data.media]]){const value=$(key).value;$(key).innerHTML=`<option value="">${key==='page'?'Chọn Page đã kết nối':'Chọn video'}</option>`+list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');$(key).value=value;}
$('count-pages').textContent=data.pages.length;for(const status of ['queued','published','review'])$('count-'+status).textContent=data.jobs.filter(x=>x.status===status).length;
$('page-list').innerHTML=data.pages.length?data.pages.map(p=>`<div class="page-item">◎ ${esc(p.name)}<small>Page ID: ${esc(p.id)}</small></div>`).join(''):'<div class="empty">Chưa có Page được kết nối.</div>';
$('jobs').innerHTML=data.jobs.length?data.jobs.map(j=>`<tr><td><strong>${esc(j.media_name)}</strong><small>${esc(j.caption || 'Không có caption')}</small>${j.error?`<small title="${esc(j.error)}">${esc(j.error)}</small>`:''}${j.video_id?`<small>Meta video ID: ${esc(j.video_id)}</small>`:''}</td><td>${esc(j.page_name)}</td><td>${new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(j.due))}</td><td><span class="status ${esc(j.status)}">${labels[j.status] || esc(j.status)}</span></td><td>${j.status==='queued'?`<button class="secondary cancel" data-id="${esc(j.id)}">Hủy</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Chưa có lịch đăng. Bắt đầu bằng việc kết nối Page và thêm video đầu tiên.</td></tr>';
libraryMedia=[...data.media].sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true}) || a.id.localeCompare(b.id));
renderLibrary(data.media);updateScope();updateQuick(data);
}catch(e){toast(e.message);}}
document.querySelector('.upload').innerHTML='<button type="button" id="pick-videos">＋ Chọn video trên PC</button><small>Mở thư mục, giữ Ctrl hoặc Shift để chọn nhiều file MP4/MOV rồi bấm Open. Chỉ các video được chọn mới được thêm; file gốc giữ nguyên trên máy.</small>';
$('pick-videos').onclick=async()=>{
 const button=$('pick-videos');button.disabled=true;
 try{
  const picked=await request('/api/videos/pick',{method:'POST'});if(!picked.paths.length)return;
  const result=await request('/api/videos/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:picked.paths})});
  await load();toast(`Đã chọn ${picked.paths.length} video · Thêm mới ${result.added} · Đã có hoặc khôi phục ${result.existing}`);
 }catch(e){toast(e.message);}finally{button.disabled=false;}
};
$('mode').onchange=updateScope;
$('compose-form').onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{
  const all=$('schedule-scope').value==='all';
  const due=$('mode').value==='now'?new Date().toISOString():new Date($('due').value+':00+07:00').toISOString();
  if($('mode').value!=='now' && new Date(due)<=new Date())throw new Error('Chọn thời gian trong tương lai');
  const input={pageId:$('page').value,mediaId:$('media').value,caption:$('caption').value,due};
  if(all){
   if(!libraryMedia.length)throw Error('Thư viện chưa có video');
   input.mediaIds=libraryMedia.map(m=>m.id);input.intervalMinutes=Number($('interval').value);
  }
  const result=await request(all?'/api/jobs/batch':'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  toast(all?`Đã tạo lịch cho ${result.count} video`:'Đã lưu lịch đăng');await load();
 }catch(e){toast(e.message);}finally{button.disabled=false;}
};
$('jobs').onclick=async event=>{const button=event.target.closest('.cancel');if(!button)return;try{await request('/api/jobs/'+button.dataset.id,{method:'DELETE'});await load();}catch(e){toast(e.message);}};
const updateQuick=createQuickScheduler({request,toast,reload:load});
$('refresh').onclick=load;load();setInterval(load,15000);

$('media-list').onclick=async event=>{const button=event.target.closest('.remove-media');if(!button)return;if(!confirm('Xóa video khỏi thư viện? File gốc trên máy vẫn được giữ. Quét lại thư mục sẽ thêm video trở lại.'))return;button.disabled=true;try{await request('/api/media/'+button.dataset.id,{method:'DELETE'});await load();toast('Đã xóa khỏi thư viện. File gốc vẫn được giữ.');}catch(e){toast(e.message);}finally{button.disabled=false;}};
