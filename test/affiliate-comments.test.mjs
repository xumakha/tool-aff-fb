import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {matchProduct,CommentGraph,createCommentService} from '../affiliate-comments.mjs';

const message='Đèn ngủ\nhttps://s.shopee.vn/lamp';
const product={row:2,cells:['https://shopee.vn/product/1/2','Đèn ngủ','https://s.shopee.vn/lamp',message]};
const post=(id='1_10',caption='Đèn ngủ')=>({id,message:caption,from:{id:'1'},is_published:true});
const userComment={id:'2_90',from:{id:'2'},comment_count:0};
async function settled(service,id){for(let i=0;i<500;i++){if(!service.snapshot(id).activeId)return service.snapshot(id);await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Comment task timed out');}
async function fixture(task){
 const folder=await mkdtemp(join(tmpdir(),'affiliate-comments-')),master=join(folder,'master.xlsx'),db=new DatabaseSync(join(folder,'test.sqlite'));
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('sheet 1');sheet.addRow(['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung']);sheet.addRow(product.cells);await book.xlsx.writeFile(master);
 const model={posts:[post()],comments:{},writes:[],reads:[],onWrite:null,postOverride:null};
 const meta={request:async(path,token,body)=>{
  assert.equal(token,'test-page-token');const u=new URL('https://graph.test/'+path),segments=u.pathname.slice(1).split('/'),[id,edge]=segments;
  if(body){model.writes.push({id,message:body.message});if(model.onWrite)return model.onWrite(id,body);return {id:id+'_100'};}
  model.reads.push(path);
  if(edge==='published_posts')return {data:model.posts};
  if(edge==='comments')return {data:model.comments[id]||[]};
  return model.postOverride||model.posts.find(item=>item.id===id);
 }};
 const options={db,meta,masterFile:master,getPage:id=>id==='1'?{id:'1',name:'Page thử nghiệm',token:'test-page-token'}:null,sleep:async()=>{}};
 const service=createCommentService(options);
 try{await task({service,model,master,db,options});}finally{db.close();await rm(folder,{recursive:true,force:true});}
}

test('matches exact Unicode names and title lines without fuzzy substring matching',()=>{
 assert.equal(matchProduct('ĐÈN  NGỦ\nhttps://example.com\n#giadung',[product]).message,message);
 assert.equal(matchProduct('Đèn ngủ'.normalize('NFD'),[product]).status,'eligible');
 assert.equal(matchProduct('Đèn ngủ loại khác',[product]).status,'unmatched');
 assert.equal(matchProduct('den ngu',[product]).status,'unmatched');
 assert.equal(matchProduct('Đèn ngủ',[product,{...product,row:3,cells:[...product.cells.slice(0,3),'different https://s.shopee.vn/lamp']}]).status,'ambiguous');
 assert.equal(matchProduct('Đèn ngủ',[{...product,cells:[...product.cells.slice(0,3),'']}]).status,'invalid');
 assert.equal(matchProduct('Đèn ngủ',[product,{...product,row:4}]).status,'eligible');
});

test('reads all comment pages and nested replies, identifying the Page by ID instead of name',async()=>{
 const calls=[];
 const graph=new CommentGraph({request:async path=>{
  calls.push(path);const u=new URL('https://graph.test/'+path);
  if(u.pathname==='/1_10/comments'&&!u.searchParams.has('after'))return {data:[userComment],paging:{next:'https://evil.test/?access_token=secret',cursors:{after:'second'}}};
  if(u.pathname==='/1_10/comments')return {data:[{id:'2_91',from:{id:'2'},comment_count:1}]};
  return {data:[{id:'1_99',from:{id:'1',name:'Page renamed'},comment_count:0}]};
 }},'token');
 assert.equal((await graph.ownComment('1_10','1')).own,true);
 assert.equal(calls.length,3);assert.ok(calls.every(path=>!path.includes('evil.test')&&!path.includes('secret')));
});

test('unknown authors and incomplete pagination are never treated as no own comment',async()=>{
 const unknown=new CommentGraph({request:async()=>({data:[{id:'2_90',comment_count:0}]})},'token');
 assert.equal((await unknown.ownComment('1_10','1')).unknown,true);
 const incomplete=new CommentGraph({request:async()=>({data:[],paging:{next:'yes'}})},'token');
 await assert.rejects(incomplete.ownComment('1_10','1'),/trang dữ liệu/);
});

test('scan never posts, allows other-user comments, excludes own/unknown comments, preserves Excel',async()=>fixture(async({service,model,master})=>{
 model.posts=[post('1_10'),post('1_11'),post('1_12'),post('1_13','Không khớp')];
 model.comments['1_10']=[userComment];model.comments['1_11']=[{id:'1_80',from:{id:'1'},comment_count:0}];model.comments['1_12']=[{id:'2_92',comment_count:0}];
 const before=await readFile(master),{runId}=await service.scan({pageId:'1'}),state=await settled(service,runId);
 assert.deepEqual(state.counts,{eligible:1,already:1,unknown:1,unmatched:1});assert.equal(model.writes.length,0);assert.deepEqual(await readFile(master),before);
 assert.ok(!JSON.stringify(state).includes('test-page-token'));
}));

test('rechecks before sending, posts exact column D once, and retains duplicate protection across restarts',async()=>fixture(async({service,model,options})=>{
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);
 await assert.rejects(service.start({runId,postIds:['1_10']}),/xác nhận/);
 await service.start({runId,postIds:['1_10'],confirmed:true});const state=await settled(service,runId);
 assert.equal(state.counts.posted,1);assert.deepEqual(model.writes,[{id:'1_10',message}]);
 const restarted=createCommentService(options),next=await restarted.scan({pageId:'1'});const rescanned=await settled(restarted,next.runId);
 assert.equal(rescanned.counts.already,1);assert.equal(model.writes.length,1);
}));

test('a Page comment added after preview prevents sending',async()=>fixture(async({service,model})=>{
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);
 model.comments['1_10']=[{id:'1_81',from:{id:'1'},comment_count:0}];
 await service.start({runId,postIds:['1_10'],confirmed:true});assert.equal((await settled(service,runId)).counts.already,1);assert.equal(model.writes.length,0);
}));

test('changed caption or Excel rejects outdated previews',async()=>fixture(async({service,model,master})=>{
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);
 model.postOverride=post('1_10','Sản phẩm khác');await service.start({runId,postIds:['1_10'],confirmed:true});assert.equal((await settled(service,runId)).counts.changed,1);assert.equal(model.writes.length,0);
 model.postOverride=null;const next=await service.scan({pageId:'1'});await settled(service,next.runId);await appendFile(master,Buffer.from('changed'));
 await assert.rejects(service.start({runId:next.runId,postIds:['1_10'],confirmed:true}),/Excel tổng đã thay đổi/);assert.equal(model.writes.length,0);
}));

test('uncertain POST stops the batch and is never retried after rescanning/restart',async()=>fixture(async({service,model,options})=>{
 model.posts=[post('1_10'),post('1_11')];model.onWrite=()=>{throw Error('network disconnected');};
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);await service.start({runId,postIds:['1_10','1_11'],confirmed:true});
 const result=await settled(service,runId);assert.equal(result.run.status,'review');assert.equal(result.counts.uncertain,1);assert.equal(model.writes.length,1);
 const restarted=createCommentService(options),next=await restarted.scan({pageId:'1'});assert.equal((await settled(restarted,next.runId)).counts.uncertain,1);assert.equal(model.writes.length,1);
}));

test('explicit Meta rejection stops the batch and does not claim a posted comment',async()=>fixture(async({service,model})=>{
 model.onWrite=()=>{throw Object.assign(Error('Meta API: 200'),{metaRejected:true,metaCode:200});};
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);await service.start({runId,postIds:['1_10'],confirmed:true});const result=await settled(service,runId);
 assert.equal(result.run.status,'failed');assert.equal(result.counts.rejected,1);assert.equal(result.counts.posted,undefined);
}));

test('stop during an active send records its result then stops before the next post',async()=>fixture(async({service,model})=>{
 model.posts=[post('1_10'),post('1_11')];let finish;
 model.onWrite=()=>new Promise(resolve=>{finish=resolve;});
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);await service.start({runId,postIds:['1_10','1_11'],confirmed:true});
 for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
 service.stop(runId);finish({id:'1_10_100'});const result=await settled(service,runId);
 assert.equal(result.run.status,'stopped');assert.equal(result.counts.posted,1);assert.equal(model.writes.length,1);
}));

test('forged selections and overlapping starts cannot publish extra comments',async()=>fixture(async({service,model})=>{
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);
 await assert.rejects(service.start({runId,postIds:['9_99'],confirmed:true}),/không đủ điều kiện/);
 const first=service.start({runId,postIds:['1_10'],confirmed:true});
 await assert.rejects(service.start({runId,postIds:['1_10'],confirmed:true}),/lượt quét\/bình luận khác/);
 await first;await settled(service,runId);assert.equal(model.writes.length,1);
}));

test('restart marks a pending send uncertain and prevents automatic reuse',async()=>fixture(async({service,db,options,model})=>{
 const {runId}=await service.scan({pageId:'1'});await settled(service,runId);
 db.prepare('INSERT INTO affiliate_comment_receipts VALUES(?,?,?,?,?,?)').run('1','1_10','sending',null,message,new Date().toISOString());
 const restarted=createCommentService(options),next=await restarted.scan({pageId:'1'});const state=await settled(restarted,next.runId);
 assert.equal(state.counts.uncertain,1);assert.equal(model.writes.length,0);
}));
