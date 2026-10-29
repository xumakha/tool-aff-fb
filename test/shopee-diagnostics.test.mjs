import {test} from 'node:test';
import assert from 'node:assert/strict';
import diagnostics from '../desktop/shopee-diagnostics.cjs';
test('media schema retains field structure without response values or signed URLs',()=>{
 const schema=diagnostics.mediaSchema({data:{item:{video_info_list:[{url:'https://cdn.test/video.mp4?token=secret',mms_data:'{"token":"secret"}',access_token:'secret',thumbnail:'private-value'}]},email:'private-email'}});
 const text=JSON.stringify(schema);
 for(const secret of ['secret','cdn.test','private-value','private-email','access_token'])assert.equal(text.includes(secret),false);
 assert.ok(schema.some(field=>field.path==='data.item.video_info_list[].url'&&field.kind==='absolute-url'));
 assert.ok(schema.some(field=>field.path==='data.item.video_info_list[].mms_data'&&field.kind==='json-string'));
 assert.equal(schema.find(field=>field.path==='data.item.video_info_list').count,1);
});
test('media schema is bounded and excludes recommendation and review fields',()=>{
 const data={video:{},recommendations:{video:{url:'hidden'}},reviews:{video:{url:'hidden'}}};
 for(let i=0;i<500;i++)data.video['field_'+i]='value';
 assert.ok(diagnostics.mediaSchema(data).length<=100);
 assert.deepEqual(diagnostics.mediaSchema({recommendations:{video:{url:'hidden'}},reviews:{video:{url:'hidden'}}}),[]);
});
