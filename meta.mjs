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
  async upload(url, token, bytes, size = bytes.length) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !(target.hostname === 'rupload.facebook.com' || target.hostname.endsWith('.rupload.facebook.com'))) throw new Error('Địa chỉ upload Meta không hợp lệ');
    if(!Number.isSafeInteger(size) || size<=0)throw Error('Dung lượng video upload không hợp lệ');
    const response = await this.fetch(target, {method:'POST', headers:{Authorization:`OAuth ${token}`, offset:'0', file_size:String(size),'Content-Length':String(size),'Content-Type':'application/octet-stream'},body:bytes,...(typeof bytes.pipe === 'function' ? {duplex:'half'} : {}),signal:AbortSignal.timeout(600000)});
    let result;
    try{result=await response.json();}catch{throw Error(`Upload Meta thất bại (HTTP ${Number(response.status) || 0}; phản hồi không phải JSON). Kiểm tra mạng/proxy và trạng thái video trên Facebook.`);}
    if (!response.ok || !result?.success){
      // Only retain numeric diagnostics: remote messages can contain tokens or URLs.
      const code=Number.isSafeInteger(result?.error?.code)?result.error.code:null;
      const subcode=Number.isSafeInteger(result?.error?.error_subcode)?result.error.error_subcode:null;
      const hint=code===190?'Kết nối lại Facebook vì token không hợp lệ/hết hạn.':code===10 || code===200?'Kiểm tra quyền đăng của Page và ứng dụng.':'Kiểm tra trạng thái video, định dạng file và kết nối mạng; chưa thể xác định nguyên nhân chỉ từ mã lỗi.';
      throw Error(`Meta không chấp nhận video upload (HTTP ${Number(response.status) || 0}${code!==null?`; code ${code}`:''}${subcode!==null?`; subcode ${subcode}`:''}). ${hint}`);
    }
  }
  async finish(page, token, video, caption) { return this.request(`${page}/video_reels`, token, {upload_phase:'finish',video_id:video,video_state:'PUBLISHED',description:caption}); }
  async status(video, token) { return this.request(`${video}?fields=status,permalink_url`, token); }
}
