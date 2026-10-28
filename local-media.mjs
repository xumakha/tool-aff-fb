import {open, readdir, realpath, stat} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
export async function inspectVideo(path) {
  const file = await realpath(path), info = await stat(file);
  if (!info.isFile() || !/\.(mp4|mov)$/i.test(file)) throw new Error('Chỉ nhận file MP4/MOV');
  const handle = await open(file, 'r');
  try {
    const bytes = Buffer.alloc(12), {bytesRead} = await handle.read(bytes, 0, 12, 0);
    if (bytesRead < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Container MP4/MOV không hợp lệ');
  } finally { await handle.close(); }
  return {path:file, name:file.split(/[\\/]/).pop(), size:info.size, mtime:info.mtimeMs};
}
export async function scanFolder(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Nhập đường dẫn thư mục tuyệt đối trên máy chạy tool');
  const folder = await realpath(path);
  if (!(await stat(folder)).isDirectory()) throw new Error('Đường dẫn không phải thư mục');
  const files = [], skipped = [];
  // Scan only this folder: no recursion or symlink traversal into other folders.
  for (const entry of await readdir(folder, {withFileTypes:true})) {
    if (!entry.isFile() || !/\.(mp4|mov)$/i.test(entry.name)) continue;
    try { files.push(await inspectVideo(join(folder, entry.name))); }
    catch { skipped.push(entry.name); }
  }
  return {folder, files, skipped};
}
export async function checkUnchanged(media) {
  let current;
  try { current = await inspectVideo(media.path); }
  catch { throw new Error('Không đọc được video gốc. File có thể đã bị di chuyển, xóa hoặc ổ đĩa chưa kết nối.'); }
  if (current.size !== media.size || current.mtime !== media.mtime) throw new Error('Video gốc đã thay đổi. Hãy nhập lại thư mục và tạo lịch mới.');
  return current;
}
export async function pickFolder() {
  if (process.platform === 'win32') {
    const script = "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Chon thu muc video'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Write($dialog.SelectedPath) }";
    const {stdout} = await exec('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {timeout:120000, maxBuffer:65536, windowsHide:true});
    return stdout.trim();
  }
  throw new Error('Nút chọn thư mục hiện hỗ trợ Windows. Trên hệ điều hành khác, nhập đường dẫn thư mục vào ô bên dưới.');
}
