const {downloadableVideo}=require('./shopee-media.cjs');

// Start probing immediately and keep watching playback after a metadata URL
// fails. Each URL is handed to the downloader once (it owns network retries).
async function resolveProductVideo({probe,checkStock,readSources=()=>[],readDiagnostics=()=>({}),download,pause,attempts=20}){
 const tried=new Set(),errors=[];let data,activated=false;
 for(let attempt=0;attempt<attempts;attempt++){
  if(attempt)await pause(1000);
  if(await checkStock())return {soldOut:true};
  const hasNewSource=readSources().some(url=>downloadableVideo(url)&&!tried.has(url));
  data=await probe({activate:!hasNewSource});activated=activated||!!data.activated;
  data.urls=[...new Set([...readSources(),...(data.urls||[])])];
  const api=readDiagnostics();
  if(!data.urls.some(downloadableVideo)&&api.read&&api.apiError!=null&&String(api.apiError)!=='0')return {data,activated,downloaded:false,apiError:api.apiError};
  const sources=data.urls.filter(url=>downloadableVideo(url)&&!tried.has(url));
  if(!sources.length)continue;
  sources.forEach(url=>tried.add(url));
  try{await download(sources);return {data,activated,downloaded:true};}
  catch(error){if(!error.sourceFailure)throw error;errors.push(error.message);}
 }
 if(errors.length)throw Error(`Đã thử ${tried.size} nguồn video. ${[...new Set(errors)].slice(-2).join('; ')}`);
 return {data,activated,downloaded:false};
}
module.exports={resolveProductVideo};
