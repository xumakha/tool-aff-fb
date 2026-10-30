export function installMasterTabs(){
 const main=document.querySelector('main'),header=main.querySelector('header');
 const tabs=document.createElement('div');tabs.className='workspace-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Chọn khu vực');
 tabs.innerHTML='<button type="button" id="studio-tab" role="tab" aria-controls="studio-panel" aria-selected="true">Ứng dụng</button><button type="button" id="master-tab" role="tab" aria-controls="master-panel" aria-selected="false" tabindex="-1">File tổng · Chỉ xem</button><button type="button" id="comments-tab" role="tab" aria-controls="comments-panel" aria-selected="false" tabindex="-1">Bình luận affiliate</button>';
 const studio=document.createElement('div');studio.id='studio-panel';studio.setAttribute('role','tabpanel');studio.setAttribute('aria-labelledby','studio-tab');
 for(const child of [...main.children])if(child!==header)studio.append(child);
 const viewer=document.createElement('section');viewer.id='master-panel';viewer.hidden=true;viewer.setAttribute('role','tabpanel');viewer.setAttribute('aria-labelledby','master-tab');
 const frame=document.createElement('iframe');frame.title='Bảng dữ liệu file tổng, chỉ xem';frame.id='master-frame';viewer.append(frame);
 const comments=document.createElement('section');comments.id='comments-panel';comments.hidden=true;comments.setAttribute('role','tabpanel');comments.setAttribute('aria-labelledby','comments-tab');
 const commentsFrame=document.createElement('iframe');commentsFrame.id='comments-frame';commentsFrame.title='Bình luận affiliate trên bài viết của Page';comments.append(commentsFrame);
 header.after(tabs,studio,viewer,comments);
 const buttons=[...tabs.querySelectorAll('button')],panels=[studio,viewer,comments];
 function select(index){
  panels.forEach((panel,i)=>panel.hidden=i!==index);
  buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
  if(index===1&&!frame.getAttribute('src'))frame.src='/master-view.html';
  if(index===2&&!commentsFrame.getAttribute('src'))commentsFrame.src='/affiliate-comments.html';
 }
 buttons.forEach((button,index)=>button.onclick=()=>select(index));
 tabs.onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const current=buttons.findIndex(button=>button.getAttribute('aria-selected')==='true');const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  select(index);buttons[index].focus();
 };
 document.querySelector('aside nav')?.addEventListener('click',()=>select(0));
}
