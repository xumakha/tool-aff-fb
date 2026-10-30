const labels={queued:'Chờ đăng',running:'Đang upload',processing:'Meta đang xử lý',published:'Đã xuất bản',review:'Cần kiểm tra',cancelled:'Đã hủy',remote_queued:'Chờ tải lên Meta',remote_uploading:'Đang tải lên Meta',remote_confirming:'Meta xác nhận lịch'};
const pageName=job=>job.page_name||`Page ${job.page_id||'chưa xác định'}`;
export function jobStatus(job){
 const name=pageName(job);
 if(job.status==='remote_scheduled')return `${name} đã nhận lịch`;
 if(job.status==='published')return `${name} đã đăng bài`;
 if(job.status==='processing')return `${name} đang xử lý video`;
 if(job.status==='remote_confirming'&&job.remote_now)return `Meta xác nhận đăng bài cho ${name}`;
 return labels[job.status]||job.status;
}
function groupJobs(jobs){
 const groups=new Map();
 for(const job of jobs){
  if(!job.batch_id&&!String(job.status).startsWith('remote_'))continue;
  const id=String(job.page_id||'unknown');
  if(!groups.has(id))groups.set(id,{id,name:pageName(job),items:[],latest:0});
  const group=groups.get(id);group.items.push(job);group.latest=Math.max(group.latest,Date.parse(job.created)||0);
 }
 return [...groups.values()].sort((a,b)=>b.latest-a.latest||a.id.localeCompare(b.id));
}
function summary(group){
 const count=status=>group.items.filter(job=>job.status===status).length;
 const scheduled=count('remote_scheduled'),published=count('published'),processing=count('processing'),failed=count('review'),cancelled=count('cancelled');
 const pending=group.items.length-scheduled-published-processing-failed-cancelled;
 const parts=[];
 if(scheduled)parts.push(`${group.name} đã nhận lịch cho ${scheduled} video.`);
 if(published)parts.push(`${group.name} đã đăng ${published} video.`);
 if(processing)parts.push(`${group.name} còn ${processing} video Meta đang xử lý, chưa xác nhận xuất bản.`);
 if(pending)parts.push(`Đang tải và xác nhận ${pending} video cho ${group.name}.`);
 if(failed)parts.push(`${failed} video của ${group.name} cần kiểm tra trên Facebook.`);
 if(cancelled)parts.push(`${cancelled} video đã hủy.`);
 return {text:parts.join(' '),received:scheduled+published+processing};
}
export function createUploadProgress(anchor){
 const container=document.createElement('div');container.id='upload-progress';container.hidden=true;anchor.before(container);
 const panels=new Map();let sequence=0;
 return jobs=>{
  const groups=groupJobs(jobs),visible=new Set(groups.map(group=>group.id));container.hidden=!groups.length;
  for(const [id,panel] of panels)if(!visible.has(id)){panel.section.remove();panels.delete(id);}
  for(const group of groups){
   let panel=panels.get(group.id);
   if(!panel){
    const section=document.createElement('section');section.className='card upload-page';section.dataset.pageId=group.id;
    const header=document.createElement('div');header.className='card-title';
    const title=document.createElement('h2'),total=document.createElement('span'),toggle=document.createElement('button'),details=document.createElement('div'),items=document.createElement('div'),message=document.createElement('p');
    const id=++sequence;title.id='upload-title-'+id;details.id='upload-details-'+id;section.setAttribute('aria-labelledby',title.id);
    total.className='upload-total';toggle.type='button';toggle.className='secondary upload-toggle';toggle.textContent='Thu gọn';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls',details.id);
    toggle.onclick=()=>{details.hidden=!details.hidden;toggle.setAttribute('aria-expanded',String(!details.hidden));toggle.textContent=details.hidden?'Mở rộng':'Thu gọn';};
    items.className='upload-items';message.className='upload-message';message.setAttribute('role','status');
    header.append(title,total,toggle);details.append(items,message);section.append(header,details);
    panel={section,title,total,items,message,details,toggle};panels.set(group.id,panel);
   }
   const state=summary(group);panel.title.textContent=`Tiến độ tải lên Meta: ${group.name}`;panel.total.textContent=`${state.received}/${group.items.length} video Meta đã tiếp nhận`;panel.message.textContent=state.text;
   const fragment=document.createDocumentFragment();
   for(const job of group.items){
    const row=document.createElement('div');row.className='upload-item';row.dataset.jobId=job.id;
    const name=document.createElement('span'),progress=document.createElement('progress'),percent=document.createElement('strong'),status=document.createElement('small');
    const value=Math.max(0,Math.min(100,Number(job.progress)||0));name.textContent=job.media_name||'Video';progress.max=100;progress.value=value;progress.setAttribute('aria-label',`${name.textContent} · ${group.name}`);percent.textContent=value+'%';status.textContent=jobStatus(job);row.append(name,progress,percent,status);fragment.append(row);
   }
   panel.items.replaceChildren(fragment);container.append(panel.section);
  }
 };
}
