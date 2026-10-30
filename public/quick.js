import {spreadSchedule} from './schedule-time.js';
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=ms=>new Date(ms+7*3600000).toISOString().slice(0,16);
export function createQuickScheduler({request,toast,reload}){
 const section=document.createElement('section');section.className='card quick';section.id='quick-schedule';
 section.innerHTML=`<div class="card-title"><div><h2>Lên lịch nhanh</h2><p>Chọn Page, điền caption và giờ đăng cho thư viện hiện tại, rồi bấm Lên lịch/Đăng video. Ô tick chỉ dùng để xóa video.</p></div><a href="#compose" class="button secondary">＋ Thêm video</a></div>
 <div class="quick-section"><div class="quick-step">1 · Chọn Page</div><div class="quick-tools"><label>Facebook Page <span class="required" aria-label="bắt buộc">*</span><select id="quick-page" required><option value="">Chọn Page</option></select></label><p class="hint">Tất cả video trong thư viện sẽ được lên lịch hoặc đăng. Dấu <span class="required">*</span> là thông tin bắt buộc.</p></div></div>
 <div class="quick-section"><div class="quick-step">2 · Điền caption và thời gian cho tất cả video</div><div class="quick-tools"><label class="quick-caption">Caption chung (tùy chọn)<textarea id="quick-caption" rows="2" maxlength="2200" placeholder="Áp dụng cho tất cả video trong thư viện"></textarea></label><button type="button" class="secondary" id="quick-copy">Áp dụng caption cho tất cả</button><button type="button" class="secondary" id="quick-names">Lấy tên video làm caption</button></div>
 <div class="quick-tools"><label>Giờ bắt đầu tại Việt Nam<input id="quick-start" type="datetime-local"></label><label>Khoảng cách giữa bài (phút)<input id="quick-gap" type="number" min="1" max="525600" value="60"></label><label class="quick-jitter"><input id="quick-random" type="checkbox" checked>Ngẫu nhiên khoảng cách ±12 phút</label><button type="button" class="secondary" id="quick-spread">Chia giờ cho tất cả video</button></div><p id="quick-gap-note" class="hint"></p></div>
 <div class="quick-section"><div class="quick-step">3 · Kiểm tra từng video <small>(tick chỉ để xóa)</small></div><div class="table-wrap quick-table"><table><thead><tr><th><input type="checkbox" id="quick-all" aria-label="Chọn tất cả video để xóa"></th><th>VIDEO</th><th>CAPTION <span class="required">*</span></th><th>HÌNH THỨC / GIỜ ĐĂNG <span class="required">*</span></th></tr></thead><tbody id="quick-rows"></tbody></table></div></div>
 <div class="quick-footer"><span id="quick-count" role="status"></span><div class="quick-actions"><button type="button" class="secondary" id="quick-delete">Xóa video đã tick</button><button type="button" id="quick-save">Lên lịch/Đăng video</button></div></div>`;
 document.querySelector('.schedule').before(section);
 section.querySelector('a[href="#compose"]').onclick=event=>{event.preventDefault();document.getElementById('pick-videos').click();};
 document.querySelector('nav').insertAdjacentHTML('beforeend','<a href="#quick-schedule">▦ Lên lịch nhanh</a>');
 const get=id=>section.querySelector('#quick-'+id),drafts=new Map(),deleting=new Set();let rows=[],signature='',saving=false,remoteBusy=false;
 get('start').value=localTime(Date.now()+3600000);
 function gapNote(){const gap=Number(get('gap').value);get('gap-note').textContent=Number.isInteger(gap)&&gap>=1&&gap<=525600?(get('random').checked?`Mỗi khoảng cách: ${Math.max(1,gap-12)}–${gap+12} phút. Video đầu giữ giờ bắt đầu. Bấm Chia giờ để áp dụng hoặc tạo lại lịch.`:`Mỗi khoảng cách cố định ${gap} phút. Bấm Chia giờ để áp dụng.`):'Nhập khoảng cách từ 1 đến 525600 phút.';}
 get('gap').oninput=gapNote;get('random').onchange=gapNote;gapNote();
 const selected=()=>rows.filter(m=>drafts.get(m.id)?.selected);
 const observer=new IntersectionObserver(entries=>{for(const {target,isIntersecting} of entries)if(isIntersecting){target.src=target.dataset.src;observer.unobserve(target);}},{rootMargin:'100px'});
 function validDraft(d){return !!d.caption.trim() && d.caption.length<=2200 && (d.mode==='now' || (d.mode==='schedule' && Number.isFinite(Date.parse(d.due+':00+07:00')) && Date.parse(d.due+':00+07:00')>Date.now()));}
 function count(){
  const n=selected().length,invalid=rows.filter(m=>!validDraft(drafts.get(m.id))).length;
  get('count').textContent=`${rows.length} video trong thư viện · ${n} video tick để xóa`+(invalid?` · ${invalid} dòng thiếu caption hoặc giờ hợp lệ`:rows.length && !get('page').value?' · Chọn Facebook Page':'');
  get('all').checked=!!rows.length && n===rows.length;get('all').indeterminate=n>0 && n<rows.length;
  get('save').disabled=saving || remoteBusy || deleting.size>0 || !rows.length || invalid>0 || !get('page').value;
  get('delete').disabled=saving || deleting.size>0 || !n;
 }
 get('page').onchange=count;
 setInterval(count,1000);
 function render(){
  observer.disconnect();
  get('rows').innerHTML=rows.length?rows.map(m=>{const d=drafts.get(m.id);return `<tr data-id="${esc(m.id)}"><td><input type="checkbox" data-field="selected" ${d.selected?'checked':''} aria-label="Chọn ${esc(m.name)} để xóa"></td><td><div class="quick-video"><div class="thumbnail"><video muted playsinline preload="metadata" data-src="/api/media/${esc(m.id)}/preview" aria-label="Xem trước ${esc(m.name)}"></video><span>Đang tải…</span></div><strong>${esc(m.name)}</strong></div></td><td><textarea data-field="caption" rows="3" maxlength="2200" placeholder="Caption bắt buộc" aria-label="Caption bắt buộc cho ${esc(m.name)}">${esc(d.caption)}</textarea></td><td><select data-field="mode" aria-label="Hình thức đăng ${esc(m.name)}"><option value="schedule" ${d.mode==='schedule'?'selected':''}>Lên lịch</option><option value="now" ${d.mode==='now'?'selected':''}>Đăng ngay</option></select><input data-field="due" type="datetime-local" value="${esc(d.due)}" ${d.mode==='now'?'disabled':''} aria-label="Giờ đăng bắt buộc khi lên lịch cho ${esc(m.name)}"><small class="quick-due-hint" ${d.mode==='now'?'hidden':''}>Chọn giờ tương lai nếu lên lịch</small></td></tr>`;}).join(''):'<tr><td colspan="4" class="empty">Chọn video hoặc thư mục để thêm video vào bảng.</td></tr>';
  for(const row of get('rows').querySelectorAll('tr[data-id]')){
   const button=document.createElement('button');button.type='button';button.className='secondary remove-media quick-remove';button.textContent=deleting.has(row.dataset.id)?'Đang xóa…':'Xóa';button.title='Xóa khỏi thư viện, giữ file gốc';button.disabled=deleting.size>0;row.querySelector('.quick-video').append(button);
  }
  for(const video of get('rows').querySelectorAll('video')){video.onloadedmetadata=()=>{video.currentTime=Math.min(.1,video.duration/2 || 0);};video.onloadeddata=()=>{video.nextElementSibling.hidden=true;};video.onerror=()=>{video.nextElementSibling.hidden=false;video.nextElementSibling.textContent='Không có ảnh';};observer.observe(video);}count();
 }
 get('rows').oninput=event=>{const field=event.target.dataset.field,row=event.target.closest('tr');if(!field || !row)return;const d=drafts.get(row.dataset.id);d[field]=field==='selected'?event.target.checked:event.target.value;if(field==='caption')d.captionEdited=true;if(field==='mode'){row.querySelector('[data-field="due"]').disabled=d.mode==='now';row.querySelector('.quick-due-hint').hidden=d.mode==='now';}count();};
 async function removeVideos(ids){
  if(saving || deleting.size || !ids.length)return;
  if(!confirm(`Xóa ${ids.length} video khỏi thư viện và bảng lên lịch nhanh? File gốc trên máy vẫn được giữ.`))return;
  ids.forEach(id=>deleting.add(id));render();let removed=0;const errors=[];
  try{
   for(const id of ids){
    try{await request('/api/media/'+encodeURIComponent(id),{method:'DELETE'});drafts.delete(id);rows=rows.filter(m=>m.id!==id);removed++;}
    catch(error){errors.push(error.message);}
   }
   await reload();toast(`Đã xóa ${removed}/${ids.length} video. File gốc vẫn được giữ.`+(errors.length?` ${errors.length} video chưa xóa: ${errors[0]}`:''));
  }finally{deleting.clear();render();}
 }
 get('delete').onclick=()=>removeVideos(selected().map(m=>m.id));
 get('rows').onclick=event=>{
  const button=event.target.closest('.quick-remove');if(button)removeVideos([button.closest('tr').dataset.id]);
 };
 get('all').onchange=()=>{for(const m of rows)drafts.get(m.id).selected=get('all').checked;render();};
 function apply(fn){if(!rows.length)return toast('Thư viện chưa có video');rows.forEach((m,i)=>fn(drafts.get(m.id),m,i));render();}
 get('spread').onclick=()=>{const start=Date.parse(get('start').value+':00+07:00'),gap=Number(get('gap').value);if(!Number.isFinite(start) || start<=Date.now() || !Number.isInteger(gap) || gap<1 || gap>525600)return toast('Chọn giờ bắt đầu trong tương lai và khoảng cách 1–525600 phút');const times=spreadSchedule({start,count:rows.length,gap,randomize:get('random').checked});apply((d,m,i)=>{d.mode='schedule';d.due=localTime(times[i]);});};
 get('copy').onclick=()=>apply(d=>{d.caption=get('caption').value;d.captionEdited=true;});
 get('names').onclick=()=>apply((d,m)=>{d.caption=(m.product_name||m.name.replace(/\.(mp4|mov)$/i,'')).slice(0,2200);d.captionEdited=true;});
 get('save').onclick=async()=>{
  const chosen=[...rows];if(!chosen.length || saving || remoteBusy || deleting.size)return;
  try{
   if(!get('page').value)throw Error('Chọn Facebook Page cho bảng lên lịch nhanh');
   if(chosen.some(m=>!validDraft(drafts.get(m.id))))throw Error('Điền caption và chọn giờ trong tương lai hoặc Đăng ngay cho tất cả dòng đã chọn');
   const items=chosen.map(m=>{const d=drafts.get(m.id);if(d.mode!=='now' && (!d.due || Date.parse(d.due+':00+07:00')<=Date.now()))throw Error(`Chọn giờ trong tương lai cho ${m.name}`);return {mediaId:m.id,caption:d.caption,now:d.mode==='now',due:d.mode==='now'?undefined:new Date(d.due+':00+07:00').toISOString()};});
   saving=true;section.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
   const result=await request('/api/jobs/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:get('page').value,items,remote:true})});
   toast(`Đã bắt đầu tải ${result.count} video lên Meta. Giữ app mở đến khi hiện thông báo có thể tắt.`);saving=false;await reload();
  }catch(error){toast(error.message);}finally{saving=false;section.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);render();}
 };
 return data=>{
  if(saving)return;
  remoteBusy=data.jobs.some(j=>['remote_queued','remote_uploading','remote_confirming'].includes(j.status));
  const page=get('page').value;get('page').innerHTML='<option value="">Chọn Page</option>'+data.pages.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');get('page').value=page;
  const next=[...data.media].sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true}) || a.id.localeCompare(b.id));
  for(const m of next){if(!drafts.has(m.id))drafts.set(m.id,{selected:false,caption:m.affiliate_caption||'',autoCaption:m.affiliate_caption||'',mode:'schedule',due:''});else{const d=drafts.get(m.id);if(!d.captionEdited&&d.caption===(d.autoCaption||'')){d.caption=m.affiliate_caption||'';d.autoCaption=d.caption;}}}
  for(const id of drafts.keys())if(!next.some(m=>m.id===id))drafts.delete(id);
  rows=next;const key=JSON.stringify(rows);if(key!==signature){signature=key;render();}else count();
 };
}
