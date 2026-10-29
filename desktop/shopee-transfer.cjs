const {open,unlink}=require('node:fs/promises');
const {videoURL}=require('./shopee-url.cjs');
const {downloadableVideo}=require('./shopee-media.cjs');

function failure(message,properties={}){return Object.assign(Error(message),properties);}
function cancelled(){return failure('Đã dừng tải video',{cancelled:true});}
function transient(error){return !!error.retryable||/ERR_SSL_PROTOCOL_ERROR|ERR_CONNECTION_(?:RESET|CLOSED)|ERR_TIMED_OUT|ECONNRESET|ETIMEDOUT|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT/i.test(`${error.code||''} ${error.message||''} ${error.cause?.code||''}`);}
async function fileIO(operation){try{return await operation;}catch(error){error.fileFailure=true;throw error;}}
function cancelBody(body){try{void body?.cancel().catch(()=>{});}catch{/* A stream may already be locked or closed. */}}
function waitFor(promise,signal,discard=()=>{}){
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  Promise.resolve(promise).then(value=>{if(signal.aborted){discard(value);reject(signal.reason);}else resolve(value);},reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

// Validate the first bytes before writing/consuming the rest of a bad source.
// The same authenticated Electron session supplies fetch; redirects remain scoped to Shopee.
async function transfer({fetch,source,temporary,signal,isCancelled,timeout,idleTimeout,maxBytes}){
 const controller=new AbortController();let handle,reader,response,created=false;
 const stop=()=>controller.abort(cancelled());
 signal?.addEventListener('abort',stop,{once:true});
 const timer=setTimeout(()=>controller.abort(failure('Hết thời gian tải video',{retryable:true})),timeout);
 const poll=isCancelled?setInterval(()=>{if(isCancelled())stop();},200):null;
 const check=()=>{if(signal?.aborted||isCancelled?.())stop();if(controller.signal.aborted)throw controller.signal.reason;};
 const readData=async(operation,discard)=>{
  const idle=setTimeout(()=>controller.abort(failure('Hết thời gian chờ dữ liệu video',{retryable:true})),idleTimeout);
  try{return await waitFor(operation,controller.signal,discard);}finally{clearTimeout(idle);}
 };
 let size=0,target=source;
 try{
  check();
  for(let redirects=0;;redirects++){
   if(!videoURL(target))throw failure('Địa chỉ video hoặc chuyển hướng không thuộc CDN Shopee');
   // Chromium rejects a manually supplied Referer with ERR_BLOCKED_BY_CLIENT.
   // Keep the authenticated session, but let its network stack own this header.
   response=await readData(fetch(target,{redirect:'manual',signal:controller.signal,headers:{Accept:'video/mp4,application/octet-stream;q=0.9,*/*;q=0.5'}}),value=>cancelBody(value.body));
   check();
   if(response.status<300||response.status>=400)break;
   cancelBody(response.body);
   if(redirects>=5)throw failure('Nguồn video chuyển hướng quá nhiều lần');
   const location=response.headers.get('location');
   if(!location)throw failure('Chuyển hướng video thiếu địa chỉ');
   target=new URL(location,target).href;
  }
  if(!response.ok||!response.body){cancelBody(response.body);throw failure(`Nguồn video trả HTTP ${response.status}`,{retryable:[408,429,500,502,503,504].includes(response.status)});}
  reader=response.body.getReader();
  const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(/^(?:text\/|image\/)|json|mpegurl|dash\+xml/i.test(contentType))throw failure(`Nguồn trả về không phải MP4 (${contentType})`);
  const encoding=response.headers.get('content-encoding');
  const length=response.headers.get('content-length');
  const expected=!encoding&&/^\d+$/.test(length||'')?Number(length):null;
  if(expected>maxBytes)throw failure('Video vượt giới hạn dung lượng');
  let rangeSize=null;
  if(response.status===206){
   const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
   if(!range||Number(range[1])!==0||Number(range[2])+1!==Number(range[3]))throw failure('Nguồn chỉ trả một phần video (HTTP 206)');
   rangeSize=Number(range[3]);
   if(rangeSize>maxBytes)throw failure('Video vượt giới hạn dung lượng');
  }
  let header=Buffer.alloc(0),buffered=[];
  for(;;){
   check();const {done,value}=await readData(reader.read());check();if(done)break;
   const chunk=Buffer.from(value);size+=chunk.length;
   if(size>maxBytes)throw failure('Video vượt giới hạn dung lượng');
   if(!handle){
    buffered.push(chunk);header=Buffer.concat([header,chunk.subarray(0,12-header.length)]);
    if(header.length<12)continue;
    if(header.toString('ascii',4,8)!=='ftyp')throw failure(`Nguồn trả về không phải MP4${contentType?' ('+contentType+')':''}`);
    handle=await fileIO(open(temporary,'wx'));created=true;
    for(const part of buffered)await fileIO(handle.writeFile(part));buffered=[];
   }else await fileIO(handle.writeFile(chunk));
  }
  if(size<12)throw failure('Nguồn video rỗng hoặc quá ngắn');
  if(expected!=null&&size!==expected||rangeSize!=null&&size!==rangeSize)throw failure('Nguồn video tải chưa đủ dữ liệu',{retryable:true});
  await fileIO(handle.close());handle=null;check();return {source:target,size};
 }catch(error){
  if(reader)void reader.cancel().catch(()=>{});else cancelBody(response?.body);
  if(handle)await handle.close().catch(()=>{});
  if(created)await unlink(temporary).catch(()=>{});
  if(controller.signal.aborted)throw controller.signal.reason;
  throw error;
 }finally{
  clearTimeout(timer);if(poll)clearInterval(poll);signal?.removeEventListener('abort',stop);
  reader?.releaseLock();
 }
}

async function downloadVideo({fetch,sources,temporary,signal,isCancelled,timeout=120000,idleTimeout=15000,maxBytes=1024*1024*1024,retries=1}){
 const candidates=[...new Set(sources)].filter(downloadableVideo);
 if(!candidates.length)throw failure('Chưa tìm thấy nguồn MP4 có thể tải');
 const errors=[];let pending=candidates;
 // Try another quality/source before retrying a network failure on the same URL.
 for(let attempt=0;pending.length&&attempt<=retries;attempt++){
  const again=[];
  for(const source of pending){
   if(signal?.aborted||isCancelled?.())throw cancelled();
   try{return await transfer({fetch,source,temporary,signal,isCancelled,timeout,idleTimeout,maxBytes});}
   catch(error){
    if(error.cancelled||signal?.aborted||isCancelled?.())throw cancelled();
    // A local file error is not a reason to download another source.
    if(error.fileFailure)throw error;
    errors.push(error.message);if(transient(error))again.push(source);
   }
  }
  pending=again;
 }
 throw failure(`Không tải được MP4 từ ${candidates.length} nguồn: ${[...new Set(errors)].slice(-3).join('; ')}`,{sourceFailure:true});
}

module.exports={downloadVideo};
