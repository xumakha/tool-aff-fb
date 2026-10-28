function shopURL(value){const u=new URL(value);if(u.protocol!=='https:' || u.hostname!=='shopee.vn' || u.username || u.password || u.port || !/^\/[\w.-]+\/?$/.test(u.pathname))throw Error('Nhập link shop dạng https://shopee.vn/ten_shop');return u.href;}
function filename(title){let s=String(title).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');s=Array.from(s).slice(0,100).join('');if(!s)s='Video';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s='_'+s;return s;}
function videoURL(value){try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && ['shopee.vn','shopee.com','shopeemobile.com','shopeeusercontent.com','susercontent.com'].some(d=>u.hostname===d || u.hostname.endsWith('.'+d));}catch{return false;}}

module.exports={shopURL,filename,videoURL};
