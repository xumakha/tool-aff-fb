import {mkdirSync,realpathSync,copyFileSync,statSync,utimesSync,unlinkSync,constants} from 'node:fs';
import {basename,dirname,join} from 'node:path';
export const archiveName='video đã đăng';
export function ensureArchive(file){const parent=dirname(file);if(basename(parent).normalize('NFC').toLowerCase()===archiveName)return parent;const folder=join(parent,archiveName);mkdirSync(folder,{recursive:true});if(realpathSync(folder)!==folder)throw Error('Thư mục video đã đăng không được là liên kết tới vị trí khác');return folder;}
// Stage a complete copy before committing paths. Originals survive a failed transaction/crash.
export function stageScheduledMedia(db,ids){const staged=[];try{for(const id of ids){const media=db.prepare('SELECT * FROM media WHERE id=?').get(id);if(!media?.path)continue;const folder=ensureArchive(media.path);if(dirname(media.path)===folder)continue;const target=join(folder,basename(media.path));if(staged.some(s=>s.source===media.path))continue;
 const info=statSync(media.path);if(info.size!==media.size||info.mtimeMs!==media.mtime)throw Error('Video đã thay đổi trước khi chuyển thư mục');
 try{copyFileSync(media.path,target,constants.COPYFILE_EXCL);}catch(error){if(error.code==='EEXIST')throw Error(`Đã có video cùng tên trong ${folder}: ${media.name}. Đổi tên hoặc xử lý file trùng trước khi lên lịch.`);throw error;}
 staged.push({source:media.path,target,ino:info.ino,size:info.size,mtime:info.mtimeMs});const after=statSync(media.path);if(after.ino!==info.ino||after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('Video đã thay đổi khi chuyển thư mục');utimesSync(target,info.atime,info.mtime);const saved=statSync(target);
 db.prepare('UPDATE media SET path=?,folder=?,mtime=? WHERE path=? AND size=? AND mtime=?').run(target,folder,saved.mtimeMs,media.path,media.size,media.mtime);
 }return staged;}catch(error){rollbackScheduledMedia(staged);throw error;}}
export function rollbackScheduledMedia(staged){for(const entry of staged)try{unlinkSync(entry.target);}catch{}}
export function finishScheduledMedia(staged){const warnings=[];for(const entry of staged)try{const info=statSync(entry.source);if(info.ino!==entry.ino||info.size!==entry.size||info.mtimeMs!==entry.mtime)throw Error('File gốc đã đổi');unlinkSync(entry.source);}catch{warnings.push(`Lịch đã lưu, video nằm tại ${entry.target}; chưa xóa được bản cũ ${entry.source}.`);}return warnings;}
