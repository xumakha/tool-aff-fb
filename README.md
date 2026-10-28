# Reels Desk PC

Tool chạy trên PC, đọc video trực tiếp từ các thư mục trên máy và đăng Facebook Page Reels qua API Meta. Không cần S3, không sao chép video vào kho lưu trữ của tool. Giao diện mở trong trình duyệt; đây chưa phải ứng dụng đóng gói `.exe`.

## Chạy trên Windows

Cài Node.js **24 trở lên**, tải hoặc clone repo, rồi mở `start-pc.cmd`. Script tự tạo `.env` từ `.env.example` nếu chưa có và chạy tool. Mở `http://localhost:3000` (hoặc APP_URL/cổng bạn cấu hình). Giữ cửa sổ tool mở.

Hoặc chạy terminal:

```sh
git clone https://github.com/xumakha/tool-aff-fb.git
cd tool-aff-fb
npm start
```

Không cần `npm install`. Nếu đã cài bản cũ, cập nhật mã nguồn nhưng **giữ nguyên `.env` và `data/`**, sau đó khởi động lại. Migration database tự thêm cột, giữ video cũ và lịch cũ. SQLite của Node đang experimental.

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

- Hộp thoại chọn thư mục dùng Windows PowerShell + Windows Forms; chưa chạy kiểm thử trên Windows trong môi trường Linux này. macOS/Linux dùng ô đường dẫn.
- Kiểm tra container MP4/MOV sơ bộ, chưa kiểm tra codec/thời lượng/tỷ lệ bằng ffprobe. Không còn giới hạn upload local 100 MB; giới hạn Meta vẫn áp dụng.
- Chưa có file `.exe`, tự khởi động Windows, chống sleep, nhiều người dùng, AI/render, sửa lịch, hay tự đăng lại bài lỗi.
- Token AES-256-GCM không trả về frontend. Chưa có nút ngắt kết nối/xóa dữ liệu và quy trình xóa dữ liệu Meta hoàn chỉnh.

## Kiểm tra

```sh
npm test
node test/pc-smoke.mjs
```

Unit tests kiểm tra scan thư mục, tên Unicode, file đổi/mất, protocol Reels giả lập, phân trang và upload theo luồng. Smoke test dùng server tạm và dữ liệu tổng hợp để kiểm tra nhập lặp, không tạo bản sao video, lưu đường dẫn, lên/hủy lịch, từ chối file thay đổi và chặn Origin lạ. Không đăng lên Facebook thật. Smoke test cần quyền mở cổng localhost.
