# Reels Desk

MVP web app quản lý video và lên lịch Facebook Page Reels, dùng API Meta. Node.js 24+, không cần tải dependency. SQLite của Node đang ở trạng thái experimental.

## Chạy local

```sh
cd /workspace/tool-aff-fb
cp .env.example .env
npm test
npm start
```

Mặc định chỉ lắng nghe trên loopback, cổng 3000. Giao diện dùng giờ Việt Nam; dữ liệu thời gian lưu UTC. File upload tối đa 100 MB. Dữ liệu và SQLite được lưu tại `data/` và cần sao lưu cùng khóa mã hóa. Không commit `.env` hoặc `data/`.

## Cấu hình Facebook thật

1. Tạo Meta Developer App phù hợp với quyền quản lý Page. Cấu hình Facebook Login và redirect URI chính xác: `APP_URL/auth/callback`.
2. Điền `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` và `TOKEN_ENCRYPTION_KEY` vào `.env`. Khóa mã hóa là 32 byte dạng hex, sinh bằng lệnh trong `.env.example`. Không đổi khóa sau khi đã kết nối Page nếu chưa có kế hoạch chuyển đổi token.
3. Chọn phiên bản Graph API được Meta hỗ trợ; ví dụ định dạng `vNN.N`. Chưa xác minh tài liệu Meta hiện hành do mạng môi trường không truy cập được. Phải kiểm tra endpoint Reels, quyền và quy trình review trước khi dùng thật.
4. Luồng OAuth đang yêu cầu `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Quyền thực tế, App Review, chế độ phát triển/live và tài khoản thử nghiệm phụ thuộc cấu hình Meta App. Không mặc định mọi Page đều khả dụng.
5. Kết nối Facebook, chọn Page, thêm video thuộc quyền sử dụng của bạn, thử đăng một Reel và kiểm tra trực tiếp kết quả trên Page.

App thực hiện `/{page-id}/video_reels` với upload_phase=start, upload nhị phân đến URL Meta trả về, rồi finish với video_state=PUBLISHED. Lịch được lưu và thực thi bởi worker trong tiến trình server, không gửi lịch trước lên Facebook. Server phải chạy liên tục; worker kiểm tra mỗi 15 giây. Token lỗi/hết hạn cần kết nối Facebook lại.

## Trạng thái và chống trùng

`queued` → `running` → `processing` → `published`. Khi có lỗi hoặc tiến trình bị gián đoạn lúc upload/đăng, chuyển `review`; không tự đăng lại vì Meta có thể đã nhận yêu cầu. Kiểm tra Page và video ID trước khi tạo lịch mới. Chỉ bài `queued` mới hủy được. Bản MVP chạy **một tiến trình server/worker duy nhất**; không triển khai nhiều replica.

## Giới hạn hiện tại

- Chưa xác minh OAuth/đăng Reels thật với Meta; test API dùng mock.
- Phần kiểm tra upload chỉ kiểm tra phần mở đầu container MP4/MOV, chưa kiểm tra codec, tỷ lệ, thời lượng hoặc tính hợp lệ toàn bộ video. Cần ffprobe trước khi triển khai sản xuất.
- Upload giữ file trong RAM; giới hạn 100 MB. Kho video là filesystem local, chưa phải S3.
- Chưa có nhiều người dùng, phân quyền, thống kê, sửa lịch, render hoặc tự thử lại bài lỗi.
- Token mã hóa AES-256-GCM, không trả về frontend. Kết nối lại cập nhật token các Page nhận được; chưa có nút ngắt kết nối/xóa dữ liệu và luồng xóa dữ liệu Meta.
- Trước khi public: đặt `ADMIN_PASSWORD` mạnh, dùng reverse proxy HTTPS, cấu hình `APP_URL`, giới hạn request tại proxy, hoàn thiện chính sách bảo mật/xóa dữ liệu và kiểm chứng quyền Meta. Basic Auth là lớp bảo vệ tạm cho bản một người dùng, không thay thế hệ thống tài khoản production.
- Chỉ dùng `HOST=0.0.0.0` khi đã đặt `ADMIN_PASSWORD`. Không đưa token vào URL/log, không tắt TLS verification.

## Validation

`npm test` kiểm tra protocol upload bằng mock, chặn upload host không tin cậy, không rò rỉ nội dung lỗi Meta và phân trang Page. Local HTTP smoke checks đã xác nhận trang chủ, trạng thái, lưu upload tổng hợp, chặn tệp sai, từ chối lịch thiếu Page, chặn Origin lạ và báo thiếu cấu hình Meta. Đây không phải bằng chứng đăng Facebook thật hay video thật tương thích Meta.
