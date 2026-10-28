import {createQuickScheduler} from './quick.js';
const $=id=>document.getElementById(id);
const labels={queued:'Chờ đăng',running:'Đang upload',processing:'Meta đang xử lý',published:'Đã xuất bản',review:'Cần kiểm tra',cancelled:'Đã hủy',remote_queued:'Chờ tải lên Meta',remote_uploading:'Đang tải lên Meta',remote_confirming:'Meta xác nhận lịch',remote_scheduled:'Meta đã nhận lịch'};
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function request(path,options){const res=await fetch(path,options);const result=await res.json();if(!res.ok)throw new Error(result.error || 'Yêu cầu thất bại');if(result.archiveWarnings?.length)alert(result.archiveWarnings.join('\n'));return result;}
document.querySelector('.schedule').insertAdjacentHTML('beforebegin','<section id="upload-progress" class="card" hidden><div class="card-title"><h2>Tiến độ tải lên Meta</h2><span id="upload-total"></span></div><div id="upload-items"></div><p id="upload-message" role="status"></p></section>');
function renderProgress(jobs){
 const batchId=localStorage.getItem('activeRemoteBatch'),panel=$('upload-progress');
 const items=batchId?jobs.filter(j=>j.batch_id===batchId):[];panel.hidden=!items.length;if(!items.length)return;
 const confirmed=items.filter(j=>j.status==='remote_scheduled' || j.status==='published').length;
 const failed=items.filter(j=>j.status==='review').length;
 $('upload-total').textContent=`${confirmed}/${items.length} video Meta đã xác nhận`;
 $('upload-items').innerHTML=items.map(j=>`<div class="upload-item"><span>${esc(j.media_name)}</span><progress max="100" value="${Math.max(0,Math.min(100,Number(j.progress)||0))}"></progress><strong>${Math.max(0,Math.min(100,Number(j.progress)||0))}%</strong><small>${labels[j.status]||esc(j.status)}</small></div>`).join('');
 $('upload-message').textContent=failed?`${failed} video cần kiểm tra trên Facebook. Các video còn lại đã được xử lý riêng; chưa xác nhận toàn bộ lịch.`:confirmed===items.length?'Meta đã xác nhận toàn bộ video. Bạn có thể tắt app và máy. Kiểm tra lịch trong Meta Business Suite.':'Đang tải và xác nhận từng video với Meta. Giữ app và máy mở.';
}
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
renderProgress(data.jobs);
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

$('compose').insertAdjacentHTML('beforeend',`<form id="shopee-form"><h3>Tải video shop Shopee</h3><label for="shopee-url">Link shop</label><input id="shopee-url" type="url" required placeholder="https://shopee.vn/ipone_vietnam"><button id="shopee-start">Tải video của shop</button><p>Desktop Electron: chọn nơi lưu video và file Excel (.xlsx), đăng nhập Shopee nếu cần. Đóng cửa sổ Shopee để dừng. Video tải thành công tự vào thư viện.</p></form><p id="shopee-status" role="status"></p><details><summary>Lỗi tải Shopee</summary><pre id="shopee-errors"></pre></details>`);
async function shopeeStatus(){try{const s=await request('/api/shopee');$('shopee-start').disabled=s.running;$('shopee-status').textContent=s.message+(s.folder?' · '+s.folder:'')+(s.excelPath?' · Excel: '+s.excelPath:'');$('shopee-errors').textContent=(s.errors||[]).map(e=>e.url+' : '+e.error).join('\n');}catch(e){$('shopee-status').textContent=e.message;}}
$('shopee-form').onsubmit=async e=>{e.preventDefault();$('shopee-start').disabled=true;try{await request('/api/shopee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('shopee-url').value})});}catch(e){toast(e.message);}await shopeeStatus();};
shopeeStatus();setInterval(shopeeStatus,3000);

$('compose').insertAdjacentHTML('afterend',`<section class="card" id="affiliate"><h2>Ghép link Shopee Affiliate</h2><p>Chọn Excel video và file Shopee chứa link gốc + link affiliate (.xlsx hoặc .csv, tối đa 20 MB/file). Ghép theo ID shop và sản phẩm; giữ tên video và thứ tự dòng.</p><div id="affiliate-video"><h3>1. File Excel video đã tải</h3><input type="file" accept=".xlsx,.csv" aria-label="File Excel video"><div class="affiliate-columns"></div></div><div id="affiliate-mapping"><h3>2. File đối chiếu affiliate Shopee</h3><input type="file" accept=".xlsx,.csv" aria-label="File đối chiếu affiliate"><div class="affiliate-columns"></div></div><div><h3>3. File Excel tổng hợp cố định</h3><button type="button" id="affiliate-master-pick">Chọn file tổng hợp (.xlsx)</button><p id="affiliate-master-path"></p><p>Các dòng ghép thành công được thêm vào tab “sheet 1” (Liên kết gốc, Tên sản phẩm, Link affiliate, Nội dung) trong file đã chọn. Đóng Excel trước khi ghi.</p></div><button id="affiliate-merge" disabled>Ghép và thêm vào file tổng hợp</button><p id="affiliate-result" role="status"></p></section>`);
const affiliateFiles={};let affiliateMasterPath='';let affiliateSaving=false;
function affiliateSelection(kind){const el=$('affiliate-'+kind);return {id:affiliateFiles[kind]?.id,sheet:Number(el.querySelector('.aff-sheet')?.value),header:Number(el.querySelector('.aff-header')?.value),urlColumn:Number(el.querySelector('.aff-original')?.value),...(kind==='mapping'?{affiliateColumn:Number(el.querySelector('.aff-link')?.value)}:{})};}
function affiliateReady(){$('affiliate-merge').disabled=affiliateSaving||!affiliateMasterPath||!affiliateFiles.video||!affiliateFiles.mapping;}
for(const kind of ['video','mapping']){
 const el=$('affiliate-'+kind),fileInput=el.querySelector('input');
 fileInput.onchange=async()=>{delete affiliateFiles[kind];affiliateReady();const container=el.querySelector('.affiliate-columns');container.textContent='';const file=fileInput.files[0];if(!file)return;if(file.size>20*1024*1024){toast('File tối đa 20 MB');return;}fileInput.disabled=true;
 try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Không đọc được file'));reader.readAsDataURL(file);});const result=await request('/api/affiliate/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,data})});affiliateFiles[kind]=result;
 container.innerHTML=`<label>Sheet <select class="aff-sheet">${result.sheets.map(s=>`<option value="${s.id}">${esc(s.name)} (${s.rows} dòng)</option>`).join('')}</select></label><label>Dòng tiêu đề (1–30) <input class="aff-header" type="number" min="1" max="30" value="1"></label><label>Cột link sản phẩm gốc <select class="aff-original"></select></label>${kind==='mapping'?'<label>Cột link affiliate <select class="aff-link"></select></label>':''}<p class="aff-sample"></p>`;
 const render=()=>{const sheet=result.sheets.find(s=>s.id===Number(container.querySelector('.aff-sheet').value)),header=Number(container.querySelector('.aff-header').value),names=sheet.preview[header-1]||[];const options=Array.from({length:sheet.columns},(_,i)=>`<option value="${i+1}">${i+1}: ${esc(names[i]||'(trống)')}</option>`).join('');container.querySelector('.aff-original').innerHTML=options;const aff=container.querySelector('.aff-link');if(aff)aff.innerHTML=options;
 const normalized=names.map(n=>n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));const guess=normalized.findIndex(n=>/lien ket goc|link san pham|product.*(link|url)|original|link goc|origin.*(link|url)/.test(n)&&!/aff|convert/.test(n));if(guess>=0)container.querySelector('.aff-original').value=guess+1;
 if(aff){const guessed=normalized.findIndex(n=>/aff|short.*(link|url)|convert|link chuyen doi/.test(n));aff.value=guessed>=0?guessed+1:Math.min(2,sheet.columns);}
 const sample=()=>{const row=sheet.preview[header]||[];const original=Number(container.querySelector('.aff-original').value)-1;container.querySelector('.aff-sample').textContent='Dòng mẫu: '+(row[original]||'(trống)')+(aff?' → '+(row[Number(aff.value)-1]||'(trống)'):'');};container.querySelector('.aff-original').onchange=sample;if(aff)aff.onchange=sample;sample();};
 container.querySelector('.aff-sheet').onchange=render;container.querySelector('.aff-header').onchange=render;render();
 }catch(e){delete affiliateFiles[kind];container.textContent=e.message;}finally{fileInput.disabled=false;affiliateReady();}};
}
async function showAffiliateMaster(result){affiliateMasterPath=result.path||'';$('affiliate-master-path').textContent=affiliateMasterPath||'Chưa chọn file tổng hợp';affiliateReady();}
request('/api/affiliate/master').then(showAffiliateMaster).catch(e=>{$('affiliate-master-path').textContent=e.message;});
$('affiliate-master-pick').onclick=async()=>{const button=$('affiliate-master-pick');button.disabled=true;try{await showAffiliateMaster(await request('/api/affiliate/master',{method:'POST'}));}catch(e){toast(e.message);}finally{button.disabled=false;}};
$('affiliate-merge').onclick=async()=>{affiliateSaving=true;affiliateReady();$('affiliate-master-pick').disabled=true;$('affiliate-result').textContent='Đang ghép và ghi vào file tổng hợp…';try{const result=await request('/api/affiliate/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({video:affiliateSelection('video'),mapping:affiliateSelection('mapping')})});const s=result.stats;$('affiliate-result').textContent=`Đã thêm ${result.added} dòng vào ${result.path} · Bỏ qua ${result.duplicates} dòng đã có · ${s.unmatched} chưa có aff · ${s.conflicts} nhiều aff khác nhau · ${s.invalid} dòng video không hợp lệ · ${s.invalidMapping} dòng đối chiếu không hợp lệ. Các dòng chưa ghép được chưa đưa vào tổng hợp.`;}catch(e){$('affiliate-result').textContent=e.message;}finally{affiliateSaving=false;$('affiliate-master-pick').disabled=false;affiliateReady();}};

$('library').insertAdjacentHTML('beforeend',`<details id="duplicates-panel"><summary>Xóa video trùng trên máy</summary><p>Quét thư mục và các thư mục con để tìm video có đuôi (1), (2)… Chỉ xóa bản có nội dung giống hệt bản giữ lại. Video có lịch đăng hoặc lịch sử đăng được giữ nguyên. Thao tác xóa file thật trên ổ đĩa.</p><button type="button" id="duplicates-pick" class="secondary">Chọn thư mục</button><input id="duplicates-folder" placeholder="Đường dẫn thư mục tuyệt đối" aria-label="Thư mục tìm video trùng"><button type="button" id="duplicates-scan">Tìm video trùng</button><p id="duplicates-status" role="status"></p><div id="duplicates-list"></div><button type="button" id="duplicates-delete" hidden>Xóa các bản trùng đã chọn</button></details>`);
let duplicatePreview=null;
$('duplicates-pick').onclick=async()=>{try{const picked=await request('/api/folders/pick',{method:'POST'});if(picked.path)$('duplicates-folder').value=picked.path;}catch(e){toast(e.message);}};
$('duplicates-scan').onclick=async()=>{const button=$('duplicates-scan');button.disabled=true;duplicatePreview=null;$('duplicates-delete').hidden=true;$('duplicates-list').textContent='';$('duplicates-status').textContent='Đang đọc và so sánh nội dung video…';try{const result=await request('/api/videos/duplicates/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('duplicates-folder').value})});duplicatePreview=result;$('duplicates-status').textContent=`Đã quét ${result.scanned} video · ${result.candidates.length} bản trùng có thể xóa · ${result.skipped.length} file bỏ qua.`;$('duplicates-list').innerHTML=result.candidates.map(f=>`<label><input type="checkbox" class="duplicate-check" value="${esc(f.id)}" checked> Xóa: ${esc(f.path)}<br>Giữ: ${esc(f.keep)}</label>`).join('')+(result.skipped.length?`<details><summary>File bỏ qua</summary>${result.skipped.map(f=>`<p>${esc(f.path)}: ${esc(f.reason)}</p>`).join('')}</details>`:'');$('duplicates-delete').hidden=!result.candidates.length;}catch(e){$('duplicates-status').textContent=e.message;}finally{button.disabled=false;}};
$('duplicates-delete').onclick=async()=>{const ids=[...document.querySelectorAll('.duplicate-check:checked')].map(c=>c.value);if(!duplicatePreview||!ids.length)return;if(!confirm(`Xóa vĩnh viễn ${ids.length} file video trùng trên máy? Các file này không được đưa vào Thùng rác. Bản giữ lại sẽ được giữ nguyên.`))return;const button=$('duplicates-delete');button.disabled=true;$('duplicates-scan').disabled=true;try{const result=await request('/api/videos/duplicates/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:duplicatePreview.id,ids})});$('duplicates-list').textContent='';$('duplicates-status').textContent=`Đã xóa ${result.deleted.length} file trùng · ${result.skipped.length} file được giữ lại.`+(result.skipped.length?' '+result.skipped.map(f=>f.path+': '+f.reason).join(' · '):'');duplicatePreview=null;button.hidden=true;await load();}catch(e){$('duplicates-status').textContent=e.message;duplicatePreview=null;button.hidden=true;}finally{button.disabled=false;$('duplicates-scan').disabled=false;}};
