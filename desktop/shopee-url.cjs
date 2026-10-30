function shopURL(value){const u=new URL(value);if(u.protocol!=='https:' || u.hostname!=='shopee.vn' || u.username || u.password || u.port || !/^\/[\w.-]+\/?$/.test(u.pathname))throw Error('Nhập link shop dạng https://shopee.vn/ten_shop');return u.href;}
function filename(title,folder=''){
 let s=String(title).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
 if(!s)s='Video';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s='_'+s;
 // Reserve .mp4, the largest collision suffix " (10000)", and the archive
 // directory used when scheduling. Count UTF-16 units without splitting emoji.
 const extra='.mp4'.length+' (10000)'.length;
 const maximum=Math.min(255-extra,folder?259-require('node:path').resolve(folder).length-1-'video đã đăng'.length-1-extra:255-extra);
 if(maximum<5)throw Error('Đường dẫn thư mục video quá dài. Chọn thư mục ngắn hơn để lưu và chuyển video khi lên lịch.');
 let result='';for(const character of s){if(result.length+character.length>maximum)break;result+=character;}
 return result.replace(/[. ]+$/,'')||'Video';
}
function videoURL(value){try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && ['shopee.vn','shopee.com','shopeemobile.com','shopeeusercontent.com','susercontent.com'].some(d=>u.hostname===d || u.hostname.endsWith('.'+d));}catch{return false;}}

function shopFolderName(name,value){
 const u=new URL(value);
 const slug=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[<>:"/\\|?*\x00-\x1f\s]+/g,'-').replace(/-+/g,'-').replace(/^[. -]+|[. -]+$/g,'');
 const shop=slug(name)||slug(u.pathname)||'shop';
 return `${shop.slice(0,65)}-${slug(u.hostname+u.pathname).slice(0,95)}`;
}
module.exports={shopURL,filename,videoURL,shopFolderName};
