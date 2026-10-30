// Optional live test: downloads public sample videos via the production Electron
// downloader, checks their bytes, and removes the temporary files afterwards.
const {app,session}=require('electron');
const assert=require('node:assert/strict');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {productVideos}=require('../desktop/shopee-network.cjs');
const {downloadVideo}=require('../desktop/shopee-transfer.cjs');
const samples=[
 {route:'legacy',id:'65c34ee1c444f151c67fa9f96e54c3d0',size:2155822},
 {route:'mms',id:'api/v4/11110105/mms/id-11110105-6ven0-mhnl0ff87m6beb.16000031764432989.mp4',size:2465281}
];
let folder,exitCode=0;
(async()=>{
 await app.whenReady();folder=await mkdtemp(path.join(tmpdir(),'shopee-cdn-'));
 for(const sample of samples){
  const sources=productVideos({data:{product_images:{video:{video_id:sample.id,formats:null,default_format:null,mms_data:null}}}},'1:2',true);
  assert.equal(sources.length,1);
  const temporary=path.join(folder,sample.route+'.part');
  const result=await downloadVideo({fetch:session.defaultSession.fetch.bind(session.defaultSession),sources,temporary,timeout:60000});
  const bytes=await readFile(temporary);assert.equal(bytes.length,sample.size);assert.equal(bytes.toString('ascii',4,8),'ftyp');assert.equal(result.size,sample.size);
  console.log(`PASS: ${sample.route} video_id -> actual Electron CDN download -> complete MP4 (${result.size} bytes)`);
 }
})().catch(error=>{console.error(error.message);exitCode=1;}).finally(async()=>{if(folder)await rm(folder,{recursive:true,force:true});app.exit(exitCode);});
