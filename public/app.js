import {createQuickScheduler} from './quick.js';
import {installMasterTabs} from './master-tabs.js';
import {createUploadProgress,jobStatus} from './upload-progress.js';
installMasterTabs();
const $=id=>document.getElementById(id);
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function request(path,options){const res=await fetch(path,options);const result=await res.json();if(!res.ok)throw new Error(result.error || 'Yêu cầu thất bại');if(result.archiveWarnings?.length)alert(result.archiveWarnings.join('\n'));return result;}
const renderProgress=createUploadProgress(document.querySelector('.schedule'));
let librarySignature='',libraryMedia=[],libraryDeleting=false;
const librarySelected=new Set();
$('media-list').insertAdjacentHTML('beforebegin','<div class="library-actions"><label><input type="checkbox" id="library-all"> Tick tất cả video</label><span id="library-selected-count" role="status"></span><button type="button" class="secondary" id="library-delete">Xóa video đã tick</button><button type="button" class="secondary" id="library-clear">Clear tất cả video</button></div>');
function libraryControls(){
 const all=$('library-all');all.checked=libraryMedia.length>0&&librarySelected.size===libraryMedia.length;all.indeterminate=librarySelected.size>0&&!all.checked;all.disabled=libraryDeleting||!libraryMedia.length;
 $('library-selected-count').textContent=`${librarySelected.size} video đã tick`;
 $('library-delete').disabled=libraryDeleting||!librarySelected.size;$('library-clear').disabled=libraryDeleting||!libraryMedia.length;
 for(const checkbox of $('media-list').querySelectorAll('.library-check')){checkbox.checked=librarySelected.has(checkbox.dataset.id);checkbox.disabled=libraryDeleting;}
 for(const button of $('media-list').querySelectorAll('.remove-media'))button.disabled=libraryDeleting;
}
async function removeLibraryVideos(ids){
 if(libraryDeleting||!ids.length)return;
 if(!confirm(`Xóa ${ids.length} video khỏi thư viện và bảng lên lịch nhanh? File gốc trên máy vẫn được giữ.`))return;
 libraryDeleting=true;libraryControls();let removed=0;const errors=[];
 try{
  for(const id of ids){try{await request('/api/media/'+encodeURIComponent(id),{method:'DELETE'});librarySelected.delete(id);removed++;}catch(error){errors.push(error.message);}}
  await load();toast(`Đã xóa ${removed}/${ids.length} video. File gốc vẫn được giữ.`+(errors.length?` ${errors.length} video chưa xóa: ${errors[0]}`:''));
 }finally{libraryDeleting=false;libraryControls();}
}
$('library-all').onchange=()=>{librarySelected.clear();if($('library-all').checked)for(const media of libraryMedia)librarySelected.add(media.id);libraryControls();};
$('library-delete').onclick=()=>removeLibraryVideos([...librarySelected]);
$('library-clear').onclick=()=>removeLibraryVideos(libraryMedia.map(media=>media.id));
$('media-list').onchange=event=>{if(!event.target.matches('.library-check'))return;event.target.checked?librarySelected.add(event.target.dataset.id):librarySelected.delete(event.target.dataset.id);libraryControls();};
const previewObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const video=entry.target;video.src=video.dataset.src;previewObserver.unobserve(video);}},{rootMargin:'150px'});
function renderLibrary(media){
 libraryMedia=media;const ids=new Set(media.map(item=>item.id));for(const id of librarySelected)if(!ids.has(id))librarySelected.delete(id);
 libraryControls();
 const signature=JSON.stringify(media);if(signature===librarySignature)return;librarySignature=signature;previewObserver.disconnect();
 $('media-count').textContent=`${media.length} VIDEO`;
 $('media-list').innerHTML=media.length?media.map(m=>`<article class="video"><label class="library-select"><input type="checkbox" class="library-check" data-id="${esc(m.id)}" aria-label="Chọn ${esc(m.name)} để xóa"> Chọn để xóa</label><div class="thumbnail"><video muted playsinline preload="metadata" data-src="/api/media/${esc(m.id)}/preview" aria-label="Xem trước ${esc(m.name)}"></video><span>Đang tải ảnh…</span></div><strong>${esc(m.name)}</strong><small>${(m.size/1024/1024).toFixed(1)} MB</small><small title="${esc(m.path || '')}">${esc(m.path || 'Video từ bản cũ')}</small><button class="secondary remove-media" data-id="${esc(m.id)}">Xóa khỏi thư viện</button></article>`).join(''):'<p>Chọn thư mục để đưa video vào thư viện. File gốc không bị sao chép.</p>';
 libraryControls();
 for(const video of $('media-list').querySelectorAll('video')){video.onloadedmetadata=()=>{video.currentTime=Math.min(0.1,video.duration/2 || 0);};video.onloadeddata=()=>{video.nextElementSibling.hidden=true;};video.onerror=()=>{video.nextElementSibling.hidden=false;video.nextElementSibling.textContent='Không có ảnh xem trước';};previewObserver.observe(video);}
}
async function load(){try{const data=await request('/api/state');$('notice').textContent=data.configured?'Đã cấu hình Meta. Kết nối Facebook để tải các Page bạn quản lý.':'Chưa kết nối Meta App. Bạn có thể nhập thư mục video; cấu hình .env trước khi kết nối Facebook và đăng bài thật.';
$('count-pages').textContent=data.pages.length;for(const status of ['queued','published','review'])$('count-'+status).textContent=data.jobs.filter(x=>x.status===status).length;
$('count-pages').nextElementSibling.textContent='Page đang sử dụng';
$('page-list').innerHTML=data.pages.length?data.pages.map(p=>`<div class="page-item"><div>◎ ${esc(p.name)}<small>Page ID: ${esc(p.id)}</small></div><button type="button" class="secondary page-visibility" data-page-id="${esc(p.id)}" data-hidden="true" data-page-name="${esc(p.name)}">Ẩn Page</button></div>`).join(''):`<div class="empty">${data.hiddenPages?.length?'Tất cả Page đang được ẩn. Mở mục Page đã ẩn để khôi phục.':'Chưa có Page được kết nối.'}</div>`;
$('hidden-page-count').textContent=String(data.hiddenPages?.length||0);
$('hidden-page-list').innerHTML=data.hiddenPages?.length?data.hiddenPages.map(p=>`<div class="page-item"><div>◎ ${esc(p.name)}<small>Page ID: ${esc(p.id)}</small></div><button type="button" class="secondary page-visibility" data-page-id="${esc(p.id)}" data-hidden="false">Hiện lại</button></div>`).join(''):'<p>Chưa có Page nào bị ẩn.</p>';
$('jobs').innerHTML=data.jobs.length?data.jobs.map(j=>`<tr><td><strong>${esc(j.media_name)}</strong><small>${esc(j.caption || 'Không có caption')}</small>${j.error?`<small title="${esc(j.error)}">${esc(j.error)}</small>`:''}${j.video_id?`<small>Meta video ID: ${esc(j.video_id)}</small>`:''}</td><td>${esc(j.page_name)}</td><td>${new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(j.due))}</td><td><span class="status ${esc(j.status)}">${esc(jobStatus(j))}</span></td><td>${j.status==='review'?`<button class="secondary clear-review" data-id="${esc(j.id)}">Đã kiểm tra · Cho đăng lại</button>`:j.status==='queued'?`<button class="secondary cancel" data-id="${esc(j.id)}">Hủy</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Chưa có lịch đăng. Bắt đầu bằng việc kết nối Page và thêm video đầu tiên.</td></tr>';
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
const pagesColumns=pagesCard.parentElement;
$('studio-panel').prepend(pagesCard);pagesColumns.classList.add('single-column');
const pagesNav=document.querySelector('aside nav a[href="#pages"]');pagesNav.parentElement.prepend(pagesNav);
const pagesDetails=document.createElement('details');pagesDetails.className='pages-details';pagesDetails.open=true;
const pagesSummary=document.createElement('summary');pagesSummary.innerHTML='<strong>1 · Kết nối Facebook Pages</strong><span class="pages-summary-hint">Bấm để thu gọn hoặc mở rộng</span>';
const pagesContent=document.createElement('div');pagesContent.className='pages-content';
for(const child of [...pagesCard.children])pagesContent.append(child);
pagesDetails.append(pagesSummary,pagesContent);pagesCard.append(pagesDetails);
$('page-list').insertAdjacentHTML('afterend','<details id="hidden-pages"><summary>Page đã ẩn (<span id="hidden-page-count">0</span>)</summary><p>Ẩn chỉ bỏ Page khỏi các ô chọn. Kết nối và lịch đã tạo vẫn được giữ.</p><div id="hidden-page-list"></div></details>');
pagesCard.addEventListener('click',async event=>{
 const button=event.target.closest('.page-visibility');if(!button)return;
 const hidden=button.dataset.hidden==='true';
 if(hidden&&!confirm(`Ẩn Page “${button.dataset.pageName}” khỏi danh sách sử dụng? Các lịch và tác vụ đã bắt đầu của Page vẫn tiếp tục.`))return;
 button.disabled=true;
 try{await request('/api/pages/visibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:button.dataset.pageId,hidden})});await load();$('comments-frame')?.contentWindow?.postMessage({type:'pages-visibility-changed'},location.origin);toast(hidden?'Đã ẩn Page. Có thể khôi phục trong mục Page đã ẩn.':'Đã hiện lại Page trong các ô chọn.');}
 catch(error){toast(error.message);}finally{button.disabled=false;}
});
const updateQuick=createQuickScheduler({request,toast,reload:load});
$('refresh').insertAdjacentHTML('beforebegin','<button type="button" class="secondary" id="clear-history">Clear lịch sử</button>');
$('clear-history').onclick=async()=>{
 if(!confirm('Dọn khỏi danh sách các dòng đã xuất bản, đã hủy và Meta đã nhận lịch? Lịch trên Facebook vẫn tiếp tục chạy. Tool giữ dữ liệu chống đăng trùng; các dòng đang chờ, đang xử lý và cần kiểm tra vẫn hiển thị.'))return;
 const button=$('clear-history');button.disabled=true;
 try{const result=await request('/api/jobs/history',{method:'DELETE'});await load();toast(result.count?`Đã dọn ${result.count} dòng khỏi lịch sử hiển thị`:'Không có lịch sử đã hoàn tất để dọn. Các lịch đang chờ, đang xử lý hoặc cần kiểm tra được giữ lại.');}
 catch(error){toast(error.message);}finally{button.disabled=false;}
};
$('refresh').onclick=load;load();setInterval(load,15000);

$('media-list').onclick=event=>{const button=event.target.closest('.remove-media');if(button)void removeLibraryVideos([button.dataset.id]);};

$('compose').insertAdjacentHTML('beforeend',`<form id="shopee-form"><h3>Tải video shop Shopee</h3><label for="shopee-url">Link shop</label><input id="shopee-url" type="url" required placeholder="https://shopee.vn/ipone_vietnam"><button id="shopee-start">Tải video của shop</button><p>Desktop Electron: chọn nơi lưu video và file Excel (.xlsx), đăng nhập Shopee nếu cần. Đóng cửa sổ Shopee để dừng. Video tải thành công tự vào thư viện.</p></form><p id="shopee-status" role="status"></p><details><summary>Lỗi tải Shopee</summary><pre id="shopee-errors"></pre></details>`);
$('shopee-status').insertAdjacentHTML('afterend','<details><summary>Sản phẩm bỏ qua (tối đa 500 gần nhất)</summary><pre id="shopee-skipped"></pre></details>');
async function shopeeStatus(){try{const s=await request('/api/shopee');$('shopee-start').disabled=s.running;$('shopee-status').textContent=s.message+(s.folder?' · '+s.folder:'')+(s.excelPath?' · Excel: '+s.excelPath:'');if(s.affiliateExcelPath)$('shopee-status').textContent+=' | Shopee Affiliate: '+s.affiliateExcelPath;$('shopee-errors').textContent=(s.errors||[]).map(e=>e.url+' : '+e.error).join('\n');$('shopee-skipped').textContent=(s.skipped||[]).map(e=>e.url+' : '+e.reason).join('\n')||'Chưa có sản phẩm bị bỏ qua trong lượt này.';}catch(e){$('shopee-status').textContent=e.message;}}
$('shopee-form').onsubmit=async e=>{e.preventDefault();$('shopee-start').disabled=true;try{await request('/api/shopee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('shopee-url').value})});}catch(e){toast(e.message);}await shopeeStatus();};
shopeeStatus();setInterval(shopeeStatus,3000);

$('compose').insertAdjacentHTML('afterend',`<section class="card" id="affiliate"><h2>Ghép link Shopee Affiliate</h2><p>Chọn Excel video và file Shopee chứa link gốc + link affiliate (.xlsx hoặc .csv, tối đa 20 MB/file). Ghép theo ID shop và sản phẩm; giữ tên video và thứ tự dòng.</p><div id="affiliate-video"><h3>1. File Excel video đã tải</h3><input type="file" accept=".xlsx,.csv" aria-label="File Excel video"><div class="affiliate-columns"></div></div><div id="affiliate-mapping"><h3>2. File đối chiếu affiliate Shopee</h3><input type="file" accept=".xlsx,.csv" aria-label="File đối chiếu affiliate"><div class="affiliate-columns"></div></div><div><h3>3. File Excel tổng hợp cố định</h3><button type="button" id="affiliate-master-pick">Chọn file tổng hợp (.xlsx)</button><p id="affiliate-master-path"></p><p>Các dòng ghép thành công được thêm vào tab “sheet 1” (Liên kết gốc, Tên sản phẩm, Link affiliate, Nội dung) trong file đã chọn. Đóng Excel trước khi ghi.</p></div><button id="affiliate-merge" disabled>Ghép và thêm vào file tổng hợp</button><p id="affiliate-result" role="status"></p></section>`);
const affiliateFiles={};let affiliateMasterPath='';let affiliateSaving=false;
let automaticSourceCount=0,automaticSourcesBusy=false;
$('affiliate').querySelector('h2').nextElementSibling.textContent='Video Shopee tự lưu link gốc và tên sản phẩm. Chỉ cần tải file chứa link gốc + affiliate lên; app tự ghép khi nhận diện được các cột.';
$('shopee-form').querySelector('p').textContent='Chọn thư mục lưu video. Mỗi lượt tự tạo thư mục Excel Shopee chứa Ten va Link SP.xlsx (link + tên) và Shopee Affiliate.xlsx (mẫu 6 cột để upload Shopee). Dữ liệu sản phẩm tự nhập vào tool.';
$('affiliate-video').insertAdjacentHTML('beforebegin','<p id="affiliate-auto-source" role="status"></p><label><input type="checkbox" id="affiliate-manual-source"> Dùng Excel video cũ thay cho dữ liệu tự lưu</label>');
$('affiliate-auto-source').insertAdjacentHTML('beforebegin','<div><button type="button" class="secondary" id="shopee-export-folder">Mở thư mục file link sản phẩm</button><p>Chọn file Shopee Affiliate.xlsx trong thư mục vừa mở để upload lên Shopee lấy link affiliate. Nút mở file của lượt tải gần nhất.</p></div>');
$('shopee-export-folder').onclick=async()=>{
 const button=$('shopee-export-folder');button.disabled=true;
 try{await request('/api/shopee/export/location',{method:'POST'});toast('Đã mở thư mục và chọn Shopee Affiliate.xlsx để bạn upload lên Shopee.');}
 catch(error){toast(error.message);}finally{button.disabled=false;}
};
$('affiliate-video').hidden=true;
$('affiliate-manual-source').onchange=()=>{$('affiliate-video').hidden=!$('affiliate-manual-source').checked;affiliateReady();};
async function refreshAffiliateSources(){try{const s=await request('/api/affiliate/sources');automaticSourceCount=s.count;automaticSourcesBusy=s.running;$('affiliate-auto-source').textContent=s.count?`Đã tự lưu ${s.count} video/sản phẩm. Không cần tải lại Excel video.`:'Chưa có dữ liệu tự lưu. Tải video shop hoặc chọn dùng Excel video cũ.';affiliateReady();}catch(e){$('affiliate-auto-source').textContent=e.message;}}
refreshAffiliateSources();setInterval(refreshAffiliateSources,3000);
$('affiliate-master-pick').textContent='Tải bản sao Excel tổng';
$('affiliate-master-pick').parentElement.querySelector('h3').textContent='3. Excel tổng của ứng dụng';
$('affiliate-master-path').nextElementSibling.textContent='App tự lưu Excel tổng trong thư mục dữ liệu và giữ lại qua các lần mở. Đóng file trong Excel trước khi ghép.';
function affiliateSelection(kind){const el=$('affiliate-'+kind);return {id:affiliateFiles[kind]?.id,sheet:Number(el.querySelector('.aff-sheet')?.value),header:Number(el.querySelector('.aff-header')?.value),urlColumn:Number(el.querySelector('.aff-original')?.value),...(kind==='mapping'?{affiliateColumn:Number(el.querySelector('.aff-link')?.value)}:{})};}
function affiliateReady(){$('affiliate-merge').disabled=affiliateSaving||automaticSourcesBusy||!affiliateMasterPath||!($('affiliate-manual-source').checked?affiliateFiles.video:automaticSourceCount)||!affiliateFiles.mapping;}
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
 if(kind==='mapping'&&result.suggestion){const guess=result.suggestion;container.querySelector('.aff-sheet').value=guess.sheet;container.querySelector('.aff-header').value=guess.header;render();container.querySelector('.aff-original').value=guess.urlColumn;container.querySelector('.aff-link').value=guess.affiliateColumn;container.querySelector('.aff-original').onchange();await refreshAffiliateSources();}
 }catch(e){delete affiliateFiles[kind];container.textContent=e.message;}finally{fileInput.disabled=false;affiliateReady();}
 if(kind==='mapping'&&affiliateFiles.mapping?.suggestion&&!$('affiliate-merge').disabled)await $('affiliate-merge').onclick();
 else if(kind==='mapping'&&affiliateFiles.mapping&&!affiliateFiles.mapping.suggestion)$('affiliate-result').textContent='Chưa xác định chắc chắn cột link. Kiểm tra sheet/cột và bấm Ghép để tiếp tục.';
 };
}
async function showAffiliateMaster(result){affiliateMasterPath=result.path||'';$('affiliate-master-path').textContent=affiliateMasterPath||'Chưa chọn file tổng hợp';affiliateReady();}
request('/api/affiliate/master').then(showAffiliateMaster).catch(e=>{$('affiliate-master-path').textContent=e.message;});
$('affiliate-master-pick').onclick=()=>{window.location.href='/api/affiliate/master/download';};
$('affiliate-master-pick').insertAdjacentHTML('afterend',' <button type="button" id="affiliate-master-location" class="secondary">Mở thư mục file tổng</button>');
$('affiliate-master-location').onclick=async()=>{const button=$('affiliate-master-location');button.disabled=true;try{await request('/api/affiliate/master/location',{method:'POST'});}catch(e){$('affiliate-result').textContent=e.message;}finally{button.disabled=false;}};
$('affiliate-merge').onclick=async()=>{if(affiliateSaving)return;affiliateSaving=true;for(const el of $('affiliate').querySelectorAll('input,select'))el.disabled=true;affiliateReady();$('affiliate-master-pick').disabled=true;$('affiliate-result').textContent='Đang ghép và ghi vào file tổng hợp…';try{const result=await request('/api/affiliate/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...($('affiliate-manual-source').checked?{video:affiliateSelection('video')}:{}),mapping:affiliateSelection('mapping')})});const s=result.stats;$('affiliate-result').textContent=`Đã thêm ${result.added} dòng vào ${result.path} · Bỏ qua ${result.duplicates} dòng đã có · ${s.unmatched} chưa có aff · ${s.conflicts} nhiều aff khác nhau · ${s.invalid} dòng video không hợp lệ · ${s.invalidMapping} dòng đối chiếu không hợp lệ. Các dòng chưa ghép được chưa đưa vào tổng hợp.`;}catch(e){$('affiliate-result').textContent=e.message;}finally{affiliateSaving=false;for(const el of $('affiliate').querySelectorAll('input,select'))el.disabled=false;$('affiliate-master-pick').disabled=false;affiliateReady();}};

$('library').insertAdjacentHTML('beforeend',`<details id="duplicates-panel"><summary>Xóa video trùng trên máy</summary><p>Quét thư mục và các thư mục con để tìm video có đuôi (1), (2)… Chỉ xóa bản có nội dung giống hệt bản giữ lại. Video có lịch đăng hoặc lịch sử đăng được giữ nguyên. Thao tác xóa file thật trên ổ đĩa.</p><button type="button" id="duplicates-pick" class="secondary">Chọn thư mục</button><input id="duplicates-folder" placeholder="Đường dẫn thư mục tuyệt đối" aria-label="Thư mục tìm video trùng"><button type="button" id="duplicates-scan">Tìm video trùng</button><p id="duplicates-status" role="status"></p><div id="duplicates-list"></div><button type="button" id="duplicates-delete" hidden>Xóa các bản trùng đã chọn</button></details>`);
let duplicatePreview=null;
$('duplicates-panel').insertAdjacentHTML('beforebegin','<button type="button" id="duplicates-auto">Dọn nhanh video trùng (1), (2)…</button><p id="duplicates-auto-status" role="status"></p>');
$('duplicates-auto').onclick=async()=>{
 const controls=[$('duplicates-auto'),...$('duplicates-panel').querySelectorAll('button,input')];
 const previous=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
 const status=$('duplicates-auto-status');status.textContent='Chọn thư mục muốn dọn video trùng…';
 try{
  const picked=await request('/api/folders/pick',{method:'POST'});
  if(!picked.path){status.textContent='Đã hủy chọn thư mục. Không xóa file nào.';return;}
  $('duplicates-folder').value=picked.path;
  duplicatePreview=null;$('duplicates-delete').hidden=true;$('duplicates-list').textContent='';$('duplicates-status').textContent='';
  status.textContent='Đang tìm video có đuôi (1), (2)… và so sánh nội dung trong '+picked.path+'…';
  const preview=await request('/api/videos/duplicates/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:picked.path})});
  if(!preview.candidates.length){status.textContent=`Không có video trùng đủ điều kiện xóa trong ${preview.folder}. Đã quét ${preview.scanned} video.`+(preview.skipped.length?` Bỏ qua ${preview.skipped.length} file: `+preview.skipped.map(f=>f.path+': '+f.reason).join(' · '):'');return;}
  if(!confirm(`Xóa vĩnh viễn ${preview.candidates.length} video trùng có đuôi (1), (2)… trong:\n${preview.folder}\n\nBao gồm các thư mục con. Chỉ xóa file giống hệt bản được giữ lại; giữ video có lịch đăng hoặc lịch sử đăng. File bị xóa không vào Thùng rác. Tiếp tục?`)){status.textContent='Đã hủy. Không xóa file nào.';return;}
  status.textContent=`Đang xóa ${preview.candidates.length} video trùng…`;
  const result=await request('/api/videos/duplicates/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:preview.id,ids:preview.candidates.map(f=>f.id)})});
  const skipped=[...preview.skipped,...result.skipped];
  status.textContent=`Đã xóa ${result.deleted.length} video trùng trong ${preview.folder}.`+(skipped.length?` Giữ lại ${skipped.length} file: `+skipped.map(f=>f.path+': '+f.reason).join(' · '):'');
  try{await load();}catch(error){status.textContent+=' Chưa làm mới được thư viện: '+error.message;}
 }catch(error){status.textContent=error.message;}
 finally{controls.forEach((el,i)=>el.disabled=previous[i]);}
};
$('duplicates-pick').onclick=async()=>{try{const picked=await request('/api/folders/pick',{method:'POST'});if(picked.path)$('duplicates-folder').value=picked.path;}catch(e){toast(e.message);}};
$('duplicates-scan').onclick=async()=>{const button=$('duplicates-scan');button.disabled=true;$('duplicates-auto').disabled=true;duplicatePreview=null;$('duplicates-delete').hidden=true;$('duplicates-list').textContent='';$('duplicates-status').textContent='Đang đọc và so sánh nội dung video…';try{const result=await request('/api/videos/duplicates/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:$('duplicates-folder').value})});duplicatePreview=result;$('duplicates-status').textContent=`Đã quét ${result.scanned} video · ${result.candidates.length} bản trùng có thể xóa · ${result.skipped.length} file bỏ qua.`;$('duplicates-list').innerHTML=result.candidates.map(f=>`<label><input type="checkbox" class="duplicate-check" value="${esc(f.id)}" checked> Xóa: ${esc(f.path)}<br>Giữ: ${esc(f.keep)}</label>`).join('')+(result.skipped.length?`<details><summary>File bỏ qua</summary>${result.skipped.map(f=>`<p>${esc(f.path)}: ${esc(f.reason)}</p>`).join('')}</details>`:'');$('duplicates-delete').hidden=!result.candidates.length;}catch(e){$('duplicates-status').textContent=e.message;}finally{button.disabled=false;$('duplicates-auto').disabled=false;}};
$('duplicates-delete').onclick=async()=>{const ids=[...document.querySelectorAll('.duplicate-check:checked')].map(c=>c.value);if(!duplicatePreview||!ids.length)return;if(!confirm(`Xóa vĩnh viễn ${ids.length} file video trùng trên máy? Các file này không được đưa vào Thùng rác. Bản giữ lại sẽ được giữ nguyên.`))return;const button=$('duplicates-delete');button.disabled=true;$('duplicates-auto').disabled=true;$('duplicates-scan').disabled=true;try{const result=await request('/api/videos/duplicates/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:duplicatePreview.id,ids})});$('duplicates-list').textContent='';$('duplicates-status').textContent=`Đã xóa ${result.deleted.length} file trùng · ${result.skipped.length} file được giữ lại.`+(result.skipped.length?' '+result.skipped.map(f=>f.path+': '+f.reason).join(' · '):'');duplicatePreview=null;button.hidden=true;await load();}catch(e){$('duplicates-status').textContent=e.message;duplicatePreview=null;button.hidden=true;}finally{button.disabled=false;$('duplicates-scan').disabled=false;$('duplicates-auto').disabled=false;}};
