# Reels Desk PC

Tool chạy trên PC, đọc video trực tiếp từ các thư mục trên máy và đăng Facebook Page Reels qua API Meta. Không cần S3, không sao chép video vào kho lưu trữ của tool. Giao diện desktop đóng gói bằng Electron, kèm worker và SQLite.

## Ứng dụng Windows (.exe)

Bản desktop Electron có cửa sổ riêng, không cần mở trình duyệt hoặc cài Node trên máy người dùng.

- **Portable:** mở `Reels-Desk-PC-0.3.0-x64-Portable.exe`.
- **Setup:** bộ cài `Reels-Desk-PC-0.3.0-x64-Setup.exe` được tạo bởi workflow Windows trong GitHub Actions; cài đặt rồi mở shortcut **Reels Desk PC**.
- Yêu cầu Windows 10/11 64-bit. Bản hiện tại chưa có chứng thư ký mã, Windows có thể hiện cảnh báo nhà phát hành.

Menu **Reels Desk → Cấu hình Meta (.env)** mở Notepad để nhập cấu hình. Lưu rồi thoát/mở lại app. Khóa mã hóa được sinh tự động khi thiếu. Menu **Mở thư mục dữ liệu** mở nơi lưu cấu hình/database; thông thường `%APPDATA%\Reels Desk PC`. Không chỉnh `.env` trong thư mục cài đặt.

Nếu chuyển từ bản chạy bằng `npm start`: dừng hoàn toàn bản cũ, vào **Mở thư mục dữ liệu** của desktop, thoát app, rồi chép `.env` và thư mục `data/` cũ vào đó. Giữ đúng khóa mã hóa đi cùng database. Video gốc giữ nguyên vị trí. Mỗi máy chỉ chạy một phiên tool. Cổng mặc định 3000 phải còn trống; nếu đổi PORT thì sửa APP_URL/callback tương ứng.

Đăng nhập Facebook mở trong trình duyệt mặc định của Windows. Hoàn tất quyền rồi quay lại app; danh sách Page tự cập nhật. Nếu đặt ADMIN_PASSWORD, trình duyệt ngoài có thể yêu cầu username bất kỳ và mật khẩu đó. Desktop dùng API chính thức nên yêu cầu Meta App/OAuth vẫn áp dụng. Khi dùng APP_URL HTTPS qua reverse proxy, bảo vệ truy cập bằng mật khẩu.

App giữ worker chạy trong lúc cửa sổ mở và hạn chế tự sleep; không thể bảo đảm đăng khi bạn chủ động sleep/tắt máy, mất mạng hoặc thoát app. Đóng cửa sổ app là thoát worker, không chạy ngầm qua system tray.

### Build từ mã nguồn

Cần Node.js 24+ kèm npm và kết nối Internet. Trên Windows, nhấp đúp **`build-pc.cmd`** trong thư mục dự án. File tự cài dependency theo lockfile, chạy test, build Setup + Portable và mở thư mục `dist/` khi thành công. Nếu lỗi, cửa sổ giữ nguyên để đọc thông báo. Không cần đổi execution policy PowerShell.

Hoặc chạy từng lệnh trong PowerShell:

```sh
npm.cmd ci
npm.cmd test
npm.cmd run build:win
```

File đóng gói ở `dist/`. GitHub Actions: vào **Actions → Build Windows desktop → Run workflow**, đợi hoàn tất rồi tải artifact **Reels-Desk-PC-Windows** chứa Setup và Portable. Workflow cũng chạy khi push tag `v*`. Không đóng gói `.env`, database, video hoặc khóa bí mật vào executable.

Trong môi trường cloud dùng proxy, có thể cần `NODE_USE_ENV_PROXY=1` và `ELECTRON_GET_USE_PROXY=1` để tải Electron bằng proxy được cung cấp; giữ TLS verification. Build Setup từ Linux cần Wine; build trên Windows bằng workflow để tránh yêu cầu đó. Test runtime Electron trên Linux không thay thế kiểm thử UI/native dialog trên Windows.

Vẫn hỗ trợ bản giao diện local bằng `npm start` hoặc `start-pc.cmd` cho phát triển. `npm start` không cần dependency ngoài Node, còn desktop/build cần `npm ci`.

## Push mã nguồn lên GitHub

Remote `origin` của dự án là `https://github.com/xumakha/tool-aff-fb`, nhánh `main`. Sau khi kiểm tra thay đổi, chạy trong terminal tại thư mục dự án:

```powershell
git status
git add README.md build-pc.cmd
git commit -m "Add one-click Windows build script"
git push origin main
```

Nếu Git yêu cầu đăng nhập, dùng tài khoản GitHub có quyền ghi repository. `.env`, `data/`, `node_modules/` và `dist/` được bỏ qua; không dùng `git add -f` cho các mục này. File `.exe` lấy từ `dist/` hoặc artifact GitHub Actions, không đưa vào commit mã nguồn.

## Chọn video và lên lịch

1. Bấm **Chọn thư mục trên PC** để mở hộp thoại Windows. Hoặc nhập đường dẫn tuyệt đối, ví dụ `D:\Videos\Reels`, rồi bấm **Quét thư mục**.
2. Tool nhập thông tin MP4/MOV ngay trong thư mục đó, không quét thư mục con. Có thể nhập nhiều thư mục lần lượt. Quét lại không tạo mục trùng cho file không thay đổi.
3. Kết nối Facebook, chọn Page, video, caption và giờ Việt Nam; lưu lịch hoặc đăng ngay.
4. Đến giờ, worker đọc file gốc theo luồng và tải trực tiếp sang Meta; không giữ toàn bộ video trong RAM.

**Máy phải bật, không sleep, có mạng và tool phải chạy khi đến lịch.** Nếu tool tắt hoặc PC sleep, bài quá hạn sẽ được xử lý khi tool chạy lại. Đóng tab trình duyệt không dừng worker; đóng cửa sổ terminal sẽ dừng. Ổ đĩa ngoài/ổ mạng phải được kết nối và đọc được bởi tài khoản chạy tool.

Không di chuyển, đổi tên, xóa hoặc chỉnh sửa video đã lên lịch. Tool so sánh kích thước và thời gian sửa file trước khi đăng; nếu khác, bài chuyển sang cần kiểm tra. Quét lại thư mục để nhập phiên bản mới và tạo lịch mới. Đây là kiểm tra metadata, không phải hash toàn bộ video.

## Dữ liệu lưu ở đâu?

`data/reels.sqlite` chỉ lưu đường dẫn, thông tin video, caption, lịch, trạng thái và token Page đã mã hóa. **File gốc giữ nguyên ở thư mục bạn chọn.** Video từ bản upload cũ vẫn ở `data/` và dùng được; tool không tự xóa chúng. Sao lưu SQLite và khóa mã hóa; sao lưu video gốc riêng. Không commit `.env` hoặc `data/`.

## Cấu hình Meta

Sao chép `.env.example` thành `.env` nếu chưa có. Điền:

- `META_APP_ID`, `META_APP_SECRET`: ứng dụng Meta của bạn có use case/quyền quản lý Page.
- `META_GRAPH_VERSION`: phiên bản Graph API được Meta App hỗ trợ, dạng `vNN.N`.
- `TOKEN_ENCRYPTION_KEY`: 32 byte hex (64 ký tự), sinh bằng lệnh bên dưới. Không đổi khóa sau khi đã kết nối Page nếu chưa có kế hoạch chuyển đổi token.
- `APP_URL`: URL dùng để mở tool và tạo OAuth callback. Cấu hình Valid OAuth Redirect URI chính xác là `APP_URL/auth/callback`. Meta có thể yêu cầu URL HTTPS/domain phù hợp cấu hình app; dùng bản PC không bỏ qua yêu cầu OAuth. Nếu dùng reverse proxy cho OAuth, giữ chức năng duyệt file được bảo vệ bởi ADMIN_PASSWORD.
- `ADMIN_PASSWORD`: mật khẩu Basic Auth bảo vệ bản một người dùng. Bản PC chỉ lắng nghe loopback, không hỗ trợ HOST=0.0.0.0.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Khởi động lại tool sau khi thay `.env`. Không gửi App Secret/token vào chat. Luồng OAuth yêu cầu `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Quyền thực tế, review, chế độ development/live và tài khoản thử nghiệm phụ thuộc Meta App. Nếu báo Invalid Scopes, kiểm tra use case và quyền của chính App ID đang dùng.

API Reels sử dụng start → upload nhị phân → finish/PUBLISHED, sau đó theo dõi xử lý. Lịch chạy trên PC, không gửi lịch trước lên Facebook. **Đăng Meta thật chưa được xác minh** do chưa có credentials và chưa truy cập được tài liệu Meta hiện hành trong môi trường phát triển. Kiểm chứng API/permission hiện hành và một video trên Page thử nghiệm trước khi vận hành.

## Trạng thái và giới hạn

`queued` → `running` → `processing` → `published`. Lỗi hoặc gián đoạn lúc upload/đăng chuyển sang `review`, không tự lặp lại vì Meta có thể đã nhận bài. Kiểm tra Page và video ID trước khi tạo lịch mới. Chỉ hủy được bài đang chờ. Chạy **một tiến trình tool duy nhất**.

- Hộp thoại chọn thư mục trong desktop dùng Electron dialog; bản npm start dùng Windows PowerShell + Windows Forms; chưa chạy kiểm thử trên Windows trong môi trường Linux này. macOS/Linux dùng ô đường dẫn.
- Kiểm tra container MP4/MOV sơ bộ, chưa kiểm tra codec/thời lượng/tỷ lệ bằng ffprobe. Không còn giới hạn upload local 100 MB; giới hạn Meta vẫn áp dụng.
- Chưa có tự khởi động Windows, system tray, nhiều người dùng, AI/render, sửa lịch, hay tự đăng lại bài lỗi.
- Token AES-256-GCM không trả về frontend. Chưa có nút ngắt kết nối/xóa dữ liệu và quy trình xóa dữ liệu Meta hoàn chỉnh.

## Kiểm tra

```sh
npm test
node test/pc-smoke.mjs
```

Unit tests kiểm tra scan thư mục, tên Unicode, file đổi/mất, protocol Reels giả lập, phân trang và upload theo luồng. Smoke test dùng server tạm và dữ liệu tổng hợp để kiểm tra nhập lặp, không tạo bản sao video, lưu đường dẫn, lên/hủy lịch, từ chối file thay đổi và chặn Origin lạ. Không đăng lên Facebook thật. Smoke test cần quyền mở cổng localhost.
