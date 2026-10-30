import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spreadSchedule} from '../public/schedule-time.js';
const start=Date.parse('2099-01-01T09:00:00+07:00');
test('first post stays fixed and each consecutive gap independently spans base minus/plus twelve minutes',()=>{
 const values=[0,0.5,0.999999],times=spreadSchedule({start,count:4,gap:60,random:()=>values.shift()});
 assert.equal(times[0],start);assert.deepEqual(times.slice(1).map((time,i)=>(time-times[i])/60000),[48,60,72]);
});
test('disabling randomness retains exact intervals and consumes no random values',()=>{
 const times=spreadSchedule({start,count:4,gap:60,randomize:false,random:()=>{throw Error('must not sample');}});
 assert.deepEqual(times,[start,start+3600000,start+7200000,start+10800000]);
 assert.deepEqual(spreadSchedule({start,count:1,gap:60,random:()=>{throw Error('must not sample');}}),[start]);
});
test('small gaps remain at least one minute and invalid inputs are rejected',()=>{
 const values=[0,0.999999],times=spreadSchedule({start,count:3,gap:5,random:()=>values.shift()});
 assert.deepEqual(times.slice(1).map((time,i)=>(time-times[i])/60000),[1,17]);
 for(const gap of [0,-1,1.5,NaN,525601])assert.throws(()=>spreadSchedule({start,count:2,gap}),/không hợp lệ/);
});
