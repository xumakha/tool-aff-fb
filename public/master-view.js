const $=id=>document.getElementById(id);
let page=1,pages=1,query='',controller;
async function load(requestedPage=1){
 controller?.abort();const current=new AbortController();controller=current;
 $('previous').disabled=true;$('next').disabled=true;$('error').hidden=true;$('status').textContent='Đang đọc file tổng…';
 $('rows').replaceChildren();$('page-status').textContent='';
 try{
  const response=await fetch('/api/affiliate/master/view?'+new URLSearchParams({q:query,page:requestedPage}),{signal:current.signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Không đọc được file tổng.');
  if(controller!==current)return;
  page=data.page;pages=data.pages;$('file-path').textContent=data.path+' · '+data.sheet;
  $('columns').replaceChildren();for(const label of ['Dòng Excel',...data.headers]){const th=document.createElement('th');th.scope='col';th.textContent=label;$('columns').append(th);}
  const fragment=document.createDocumentFragment();
  for(const row of data.rows){const tr=document.createElement('tr');for(const value of [row.row,...row.cells]){const td=document.createElement('td');td.textContent=value;tr.append(td);}fragment.append(tr);}
  if(!data.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent=data.total?'Không tìm thấy dữ liệu phù hợp.':'File tổng chưa có dữ liệu.';tr.append(td);fragment.append(tr);}
  $('rows').append(fragment);$('status').textContent=`${data.matched} / ${data.total} dòng${query?' phù hợp với tìm kiếm':''} · Chỉ xem`;
  $('page-status').textContent=`Trang ${page} / ${pages}`;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
 }catch(error){if(current.signal.aborted)return;$('status').textContent='';$('error').textContent=error.message;$('error').hidden=false;}
}
$('search-form').onsubmit=event=>{event.preventDefault();query=$('query').value.trim();load(1);};
$('clear').onclick=()=>{$('query').value='';query='';load(1);};
$('reload').onclick=()=>load(page);
$('previous').onclick=()=>load(page-1);$('next').onclick=()=>load(page+1);
load();
