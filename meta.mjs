export class Meta {
  constructor({version, appSecret, fetcher = fetch}) { this.version = version; this.appSecret = appSecret; this.fetch = fetcher; }
  async request(path, token, body) {
    const url = new URL(`https://graph.facebook.com/${this.version}/${path}`);
    const response = await this.fetch(url, {method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type':'application/x-www-form-urlencoded'} : {})}, body: body ? new URLSearchParams(body) : undefined, signal: AbortSignal.timeout(120000)});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(`Meta API: ${result.error?.code || response.status}. Kiểm tra quyền Page và cấu hình ứng dụng.`);
    return result;
  }
  async pages(token) {
    let path = 'me/accounts?fields=id,name,access_token'; const pages = [];
    while (path) {
      const result = await this.request(path, token);
      pages.push(...(result.data || []));
      const after = result.paging?.cursors?.after;
      path = result.paging?.next && after ? `me/accounts?fields=id,name,access_token&after=${encodeURIComponent(after)}` : null;
    }
    return pages;
  }
  async begin(page, token) { return this.request(`${page}/video_reels`, token, {upload_phase:'start'}); }
  async upload(url, token, bytes) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !(target.hostname === 'rupload.facebook.com' || target.hostname.endsWith('.rupload.facebook.com'))) throw new Error('Địa chỉ upload Meta không hợp lệ');
    const response = await this.fetch(target, {method:'POST', headers:{Authorization:`OAuth ${token}`, offset:'0', file_size:String(bytes.length),'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(600000)});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('Meta không chấp nhận video upload');
  }
  async finish(page, token, video, caption) { return this.request(`${page}/video_reels`, token, {upload_phase:'finish',video_id:video,video_state:'PUBLISHED',description:caption}); }
  async status(video, token) { return this.request(`${video}?fields=status,permalink_url`, token); }
}
