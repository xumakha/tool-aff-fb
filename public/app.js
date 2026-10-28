import {createQuickScheduler} from './quick.js';
const $=id=>document.getElementById(id);
const labels={queued:'Chờ đăng',running:'Đang upload',processing:'Meta đang xử lý',published:'Đã xuất bản',review:'Cần kiểm tra',cancelled:'Đã hủy'};
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function request(path,options){const res=await fetch(path,options);const result=await res.json();if(!res.ok)throw new Error(result.error || 'Yêu cầu thất bại');return result;}
let librarySignature='';
const previewObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const video=entry.target;video.src=video.dataset.src;previewObserver.unobserve(video);}},{rootMargin:'150px'});
function renderLibrary(media){
 const signature=JSON.stringify(media);if(signature===librarySignature)return;librarySignature=signature;previewObserver.disconnect();
 $('media-count').textContent=`${media.length} VIDEO`;
 $('media-list').innerHTML=media.length?media.map(m=>`<article class="video"><div class="thumbnail"><video muted playsinline preload="metadata" data-src="/api/media/${esc(m.id)}/preview" aria-label="Xem trước ${esc(m.name)}"></video><span>Đang tải ảnh…</span></div><strong>${esc(m.name)}</strong><small>${(m.size/1024/1024).toFixed(1)} MB</small><small title="${esc(m.path || '')}">${esc(m.path || 'Video từ bản cũ')}</small><button class="secondary remove-media" data-id="${esc(m.id)}">Xóa khỏi thư viện</button></article>`).join(''):'<p>Chọn thư mục để đưa video vào thư viện. File gốc không bị sao chép.</p>';
 for(const video of $('media-list').querySelectorAll('video')){video.onloadedmetadata=()=>{video.currentTime=Math.min(0.1,video.duration/2 || 0);};video.onloadeddata=()=>{video.nextElementSibling.hidden=true;};video.onerror=()=>{video.nextElementSibling.hidden=false;video.nextElementSibling.textContent='Không có ảnh xem trước';};previewObserver.observe(video);}
}
async function load(){try{const data=await request('/api/state');$('notice').textContent=data.configured?'Đã cấu hình Meta. Kết nối Facebook để tải các Page bạn quản lý.':'Chưa kết nối Meta App. Bạn có thể nhập thư mục video; cấu hình .env trước khi kết nối Facebook và đăng bài thật.';
$('count-pages').textContent=data.pages.length;for(const status of ['queued','published','review'])$('count-'+status).textContent=data.jobs.filter(x=>x.status===status).length;
$('page-list').innerHTML=data.pages.length?data.pages.map(p=>`<div class="page-item">◎ ${esc(p.name)}<small>Page ID: ${esc(p.id)}</small></div>`).join(''):'<div class="empty">Chưa có Page được kết nối.</div>';
$('jobs').innerHTML=data.jobs.length?data.jobs.map(j=>`<tr><td><strong>${esc(j.media_name)}</strong><small>${esc(j.caption || 'Không có caption')}</small>${j.error?`<small title="${esc(j.error)}">${esc(j.error)}</small>`:''}${j.video_id?`<small>Meta video ID: ${esc(j.video_id)}</small>`:''}</td><td>${esc(j.page_name)}</td><td>${new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(j.due))}</td><td><span class="status ${esc(j.status)}">${labels[j.status] || esc(j.status)}</span></td><td>${j.status==='review'?`<button class="secondary clear-review" data-id="${esc(j.id)}">Đã kiểm tra · Cho đăng lại</button>`:j.status==='queued'?`<button class="secondary cancel" data-id="${esc(j.id)}">Hủy</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Chưa có lịch đăng. Bắt đầu bằng việc kết nối Page và thêm video đầu tiên.</td></tr>';
renderLibrary(data.media);updateQuick(data);
}catch(e){toast(e.message);}}
$('pick-videos').onclick=async()=>{
 const button=$('pick-videos');button.disabled=true;
 try{
  const picked=await request('/api/videos/pick',{method:'POST'});if(!picked.paths.length)return;
  const result=await request('/api/videos/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:picked.paths})});
  await load();toast(`Đã chọn ${picked.paths.length} video · Thêm mới ${result.added} · Đã có hoặc khôi phục ${result.existing}`);
 }catch(e){toast(e.message);}finally{button.disabled=false;}
};
$('pick-folder').onclick=async()=>{
 const button=$('pick-folder');button.disabled=true;
 try{
  const picked=await request('/api/folders/pick',{method:'POST'});if(!picked.path)return;
  const result=await request('/api/folders/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:picked.path})});
  await load();toast(`Thêm mới ${result.added} video · Đã có hoặc khôi phục ${result.existing} · Bỏ qua ${result.skipped.length} tệp không hợp lệ`);
 }catch(error){toast(error.message);}finally{button.disabled=false;}
};
$('jobs').onclick=async event=>{
 const button=event.target.closest('.cancel,.clear-review');if(!button)return;
 const review=button.classList.contains('clear-review');
 if(review && !confirm('Bạn đã kiểm tra trên Facebook và xác nhận video chưa được đăng hoặc lên lịch ở đó? Xác nhận sẽ bỏ lần lỗi này để cho phép tạo lịch mới, không xóa bài trên Facebook.'))return;
 button.disabled=true;
 try{await request('/api/jobs/'+button.dataset.id+(review?'/clear-review':''),review?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})}:{method:'DELETE'});await load();}
 catch(e){toast(e.message);}finally{button.disabled=false;}
};
const pagesCard=$('pages');
const pagesDetails=document.createElement('details');pagesDetails.className='pages-details';
const pagesSummary=document.createElement('summary');pagesSummary.innerHTML='<strong>Facebook Pages</strong><span class="pages-summary-hint">Bấm để xem và kết nối Page</span>';
const pagesContent=document.createElement('div');pagesContent.className='pages-content';
for(const child of [...pagesCard.children])pagesContent.append(child);
pagesDetails.append(pagesSummary,pagesContent);pagesCard.append(pagesDetails);
const updateQuick=createQuickScheduler({request,toast,reload:load});
$('refresh').insertAdjacentHTML('beforebegin','<button type="button" class="secondary" id="clear-history">Clear lịch sử</button>');
$('clear-history').onclick=async()=>{
 if(!confirm('Xóa lịch sử đã xuất bản và đã hủy trong tool? Giữ các lịch đang chờ, đang xử lý và cần kiểm tra. File gốc và bài trên Facebook không bị xóa.'))return;
 const button=$('clear-history');button.disabled=true;
 try{const result=await request('/api/jobs/history',{method:'DELETE'});await load();toast(`Đã xóa ${result.count} dòng lịch sử`);}
 catch(error){toast(error.message);}finally{button.disabled=false;}
};
$('refresh').onclick=load;load();setInterval(load,15000);

$('media-list').onclick=async event=>{const button=event.target.closest('.remove-media');if(!button)return;if(!confirm('Xóa video khỏi thư viện? File gốc trên máy vẫn được giữ. Quét lại thư mục sẽ thêm video trở lại.'))return;button.disabled=true;try{await request('/api/media/'+button.dataset.id,{method:'DELETE'});await load();toast('Đã xóa khỏi thư viện. File gốc vẫn được giữ.');}catch(e){toast(e.message);}finally{button.disabled=false;}};
