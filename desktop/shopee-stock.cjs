// Self-contained so the same detector runs in the Shopee renderer and fixtures.
function isSoldOut(root){
 if(!root)return false;
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase().replace(/đ/g,'d');
 for(const node of root.querySelectorAll('button, [role="button"], span, div')){
  // Ignore hidden labels, titles, descriptions and individual unavailable variants.
  if(!node.getClientRects().length||getComputedStyle(node).visibility==='hidden')continue;
  if(node.closest('h1,h2,h3,[data-sqe="name"],.product-detail,.product-variation,[role="option"],.shopee-product-rating'))continue;
  if(node.children.length&&!node.matches('button,[role="button"]'))continue;
  if(/^(?:het hang|da het hang|san pham (?:da )?het hang|sold out|out of stock|product (?:is )?(?:sold out|out of stock))$/.test(normalize(node.innerText)))return true;
 }
 return false;
}
// Never search all of <main>: recommendation cards can contain their own sold-out labels.
const stockScript=`(${isSoldOut.toString()})(document.querySelector('.product-briefing') || document.querySelector('[data-sqe="product-info"]'))`;
module.exports={isSoldOut,stockScript};
