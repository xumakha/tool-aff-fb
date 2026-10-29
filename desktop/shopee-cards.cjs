function collectCards(){
 const out=[];
 // Match the supplied Xtra badge asset, including resized, WebP and lazy variants.
 const badge='vn-11134258-7r98o-lym830xtkwipb8';
 for(const a of document.querySelectorAll('a[href]')){
  let u;try{u=new URL(a.href,location.href);}catch{continue;}
  if(u.hostname!=='shopee.vn'||!(/-i\.\d+\.\d+/.test(u.pathname)||/\/product\/\d+\/\d+/.test(u.pathname)))continue;
  const card=a.closest('[data-sqe="item"]')||a;
  const xtra=Array.from(card.querySelectorAll('img,source')).some(image=>
   ['src','srcset','data-src','data-srcset'].some(attr=>(image.getAttribute(attr)||'').includes(badge)));
  out.push({url:u.origin+u.pathname,marked:!!card.querySelector('.shopee_ic .stroke-none, .shopee_ic.stroke-none'),xtra});
 }
 return out;
}
function prioritizeProducts(products){return [...products.values()].sort((a,b)=>Number(!!b.xtra)-Number(!!a.xtra));}
module.exports={cardsScript:`(${collectCards.toString()})()`,prioritizeProducts};
