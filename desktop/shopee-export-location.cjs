const {stat,readdir}=require('node:fs/promises');
const path=require('node:path');
const exportName='Shopee Affiliate.xlsx';
async function findExport(saved,folders=[]){
 const candidates=[];
 async function check(file){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.basename(file)!==exportName)return false;
  try{const info=await stat(file);if(!info.isFile())return false;candidates.push({file,mtime:info.mtimeMs});return true;}catch{return false;}
 }
 if(await check(saved))return saved;
 // Upgrade from versions that did not remember the export path: inspect only
 // known video folders and their immediate shop-export subfolders.
 for(const folder of new Set(folders)){
  if(!path.isAbsolute(folder))continue;
  await check(path.join(folder,exportName));
  let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch{continue;}
  for(const entry of entries){
   if(!entry.isDirectory()||entry.isSymbolicLink())continue;
   const directory=path.join(folder,entry.name);
   try{if(!(await stat(path.join(directory,'Ten va Link SP.xlsx'))).isFile())continue;}catch{continue;}
   await check(path.join(directory,exportName));
  }
 }
 candidates.sort((a,b)=>b.mtime-a.mtime);return candidates[0]?.file||null;
}
module.exports={findExport};
