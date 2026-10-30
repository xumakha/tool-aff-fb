// Add a fresh interval between consecutive videos; do not independently offset
// each video's timestamp, which would widen the gap beyond the requested range.
export function spreadSchedule({start,count,gap,randomize=true,random=Math.random}){
 if(!Number.isFinite(start)||!Number.isInteger(count)||count<0||!Number.isInteger(gap)||gap<1||gap>525600)throw Error('Giờ bắt đầu hoặc khoảng cách không hợp lệ.');
 const minimum=Math.max(1,gap-12),maximum=gap+12,times=[];let time=start;
 for(let i=0;i<count;i++){
  if(i){
   let interval=gap;
   if(randomize){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Không tạo được khoảng cách ngẫu nhiên.');interval=minimum+Math.floor(value*(maximum-minimum+1));}
   time+=interval*60000;
  }
  times.push(time);
 }
 return times;
}
