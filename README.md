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

App giữ worker chạy trong lúc cửa sổ mở và hạn chế tự sleep. Với Lên lịch nhanh, giữ app/máy mở đến khi tất cả video hiện Meta đã nhận lịch; lúc đó lịch được giữ trên Facebook và có thể tắt máy. Nếu tắt khi còn video đang tải hoặc cần kiểm tra, lịch chưa được xác nhận đầy đủ. Lịch PC cũ vẫn cần app chạy đến giờ đăng. Đóng cửa sổ app là thoát worker, không chạy ngầm qua system tray.

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

Vẫn hỗ trợ bản giao diện local bằng `npm start` hoặc `start-pc.cmd` cho phát triển. Chạy `npm ci` trước khi dùng `npm start`, desktop hoặc build để cài các dependency (bao gồm thư viện đọc Excel).

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

1. Bấm **Chọn video trên PC** hoặc **Thêm video** trong bảng nhanh. Mở thư mục và giữ Ctrl/Shift để chọn các file MP4/MOV cần thêm, rồi bấm Open.
2. Chỉ các file đã chọn được thêm vào thư viện (tối đa 1000 file/lần). Có thể thêm nhiều lần; file không thay đổi không bị tạo trùng. Hủy hộp thoại không thêm video nào.
3. Kết nối Facebook, chọn Page, video, caption và giờ Việt Nam; lưu lịch hoặc đăng ngay.
4. Trong Lên lịch nhanh, app đọc file gốc theo luồng và tải lên Meta ngay, không giữ toàn bộ video trong RAM. Sau khi Meta xác nhận lịch, có thể tắt máy.

Sau khi chọn file, **Thư viện video** hiển thị danh sách kèm khung hình xem trước, tên, dung lượng và đường dẫn. Video có codec không được trình duyệt hỗ trợ hoặc file không còn đọc được sẽ hiện “Không có ảnh xem trước”. Ngay sau khi nhận yêu cầu lên lịch, video tự được bỏ khỏi thư viện và bảng nhanh, chuyển file vào thư mục con **video đã đăng** và cập nhật đường dẫn để tải lên Meta. Theo dõi video chờ, đang xử lý hoặc lỗi trong Lịch xuất bản. Nếu tạo lịch thất bại, video vẫn ở thư viện. Chọn lại file đã bỏ sẽ đưa nó trở lại thư viện.

Nút **Xóa khỏi thư viện** chỉ bỏ video khỏi danh sách, giữ nguyên file gốc và lịch sử đăng. Không cho xóa video có bài chờ, đang đăng/xử lý hoặc cần kiểm tra. Quét lại thư mục sẽ đưa video đã bỏ trở lại thư viện.

**Lên lịch nhanh:** máy phải bật, có mạng, app chạy và ổ video còn kết nối trong suốt quá trình tải lên. Thanh tiến độ chỉ đạt 100% sau phản hồi xác nhận của Meta. Chỉ khi toàn bộ video hiện Meta đã nhận lịch mới tắt app/máy. Nếu app dừng giữa upload, bài chuyển Cần kiểm tra; không tự đăng lại để tránh trùng. Lịch PC cũ vẫn cần app chạy đến giờ đăng.

Không di chuyển, đổi tên, xóa hoặc chỉnh sửa video đã lên lịch. Tool so sánh kích thước và thời gian sửa file trước khi đăng; nếu khác, bài chuyển sang cần kiểm tra. Quét lại thư mục để nhập phiên bản mới và tạo lịch mới. Đây là kiểm tra metadata, không phải hash toàn bộ video.

### Lên lịch từng video hoặc toàn bộ thư viện

Từ bản 0.3.12, mỗi Page trong **Kết nối Facebook Pages** có nút **Ẩn Page**. Page đã ẩn không còn trong các ô chọn đăng video/bình luận; mở mục **Page đã ẩn → Hiện lại** để sử dụng lại. Trạng thái ẩn được lưu qua các lần mở app và giữ nguyên khi kết nối lại Facebook. Ẩn không xóa Page/token hoặc hủy lịch/tác vụ đã bắt đầu; các lịch và tiến độ đang có vẫn được hiển thị để theo dõi. Muốn tạo tác vụ mới cho Page đã ẩn, hãy hiện lại trước.

Từ bản 0.3.11, **Lên lịch nhanh** có tùy chọn **Ngẫu nhiên khoảng cách ±12 phút**, mặc định bật. Ví dụ khoảng cách gốc 60 phút sẽ tạo từng khoảng riêng trong phạm vi 48–72 phút; video đầu giữ nguyên giờ bắt đầu, các giờ tiếp theo cộng dồn theo từng khoảng đã chọn. Khi khoảng cách gốc nhỏ, giới hạn dưới là 1 phút để giờ đăng không bị trùng/lùi. Bỏ chọn để dùng khoảng cách cố định. Bấm **Chia giờ cho tất cả video** để áp dụng; bấm lại sẽ tạo lịch mới. Các giờ hiện trong bảng là các giờ được gửi khi bấm Lên lịch, không ngẫu nhiên lại lúc upload. Có thể sửa từng giờ trước khi gửi.

Từ bản 0.3.9, mỗi Page có một khối **Tiến độ tải lên Meta: Tên Page** riêng, gồm các lượt tải vẫn còn hiển thị trong lịch sử. Tải cho Page mới không làm mất khối của Page trước; mỗi khối thu gọn/mở rộng độc lập. Trạng thái **Tên Page đã nhận lịch** xuất hiện sau khi Meta xác nhận lịch, cả trong khối tiến độ lẫn Lịch xuất bản. **Đã đăng bài** và **đang xử lý video** được hiển thị riêng để không nhầm với đã nhận lịch. Dùng **Clear lịch sử** sẽ dọn các dòng hoàn tất và các khối tương ứng; cách xử lý tải/lên lịch giữ nguyên.

**Lên lịch nhanh** hiển thị mỗi video một dòng có ảnh thu nhỏ, caption và giờ riêng. Chọn Page; chia giờ, áp dụng caption chung hoặc lấy tên video làm caption sẽ tác động lên **toàn bộ video trong thư viện**. Có thể sửa từng dòng trước khi bấm **Lên lịch/Đăng video** để lưu tất cả. Checkbox chỉ dùng để chọn video cần xóa khỏi tool, không ảnh hưởng đến việc lên lịch. Dòng chọn **Đăng ngay** được tải lên Meta ngay; phải đợi Meta xác nhận xuất bản trước khi tắt máy. Lịch Facebook cần cách thời điểm bấm đăng ít nhất 15 phút; với nhiều video phải chừa đủ thời gian tải cả loạt. Bản nháp được giữ khi tự làm mới dữ liệu, nhưng không lưu qua việc đóng/tải lại cửa sổ. Khung **Facebook Pages** mặc định thu gọn; bấm tiêu đề để mở.

Trong **Tạo lịch đăng → Phạm vi lên lịch**, chọn **Từng video** để đặt Page, caption và giờ riêng; hoặc **Tất cả video trong thư viện** để đặt chung Page/caption, giờ bắt đầu và khoảng cách giữa các bài (phút). Chế độ tất cả xếp theo tên video, hiển thị giờ đầu–cuối và tạo tối đa 1000 lịch một lần. Ví dụ bắt đầu 09:00, cách 60 phút sẽ đăng lần lượt 09:00, 10:00, 11:00.

Nếu có file thay đổi/mất hoặc video đã có bài chờ, đang xử lý hay cần kiểm tra trên Page đó, cả lượt tạo lịch sẽ bị từ chối. Xử lý lịch cũ hoặc chuyển sang từng video để chọn nội dung khác.

## Tải video từ shop Shopee (desktop, thử nghiệm)

Tool đọc nguồn video trong API của đúng sản phẩm, gồm các định dạng nằm trong `mms_data`, và bỏ các URL ảnh xem trước. Đồng thời, tool kích hoạt thumbnail/nút phát quanh trình phát sản phẩm (kể cả trình phát đang ẩn), phát tắt tiếng rồi dò thẻ video/source và yêu cầu mạng MP4. Nguồn từ dữ liệu đúng sản phẩm được ưu tiên trước nguồn mạng dự phòng; playlist HLS/DASH không được tải nhầm thành MP4. Khi Shopee đổi cấu trúc ô video hoặc chỉ cung cấp streaming chưa hỗ trợ, xem **Sản phẩm bỏ qua** để biết link và lý do.

Bản 0.3.3 xử lý cả API chỉ trả `video_id` khi `formats`, `default_format`, `mms_data` đều null. Cách dựng URL được đối chiếu với [bundle sản phẩm của Shopee](https://deo.shopeemobile.com/shopee/shopee-mobilemall-live-sg/productdetailspage/mobilemall-productdetailspage.be1e29b4bc216319.2023.js): đường dẫn `api/v4/…mp4` dùng `https://mms.vod.susercontent.com/`, mã video dạng 32 ký tự hex tại Việt Nam dùng `https://cvf.shopee.vn/file/`. Chỉ áp dụng cho trường video của đúng sản phẩm, không lấy mã ảnh bìa hoặc sản phẩm gợi ý. Nếu đã có nguồn API, tool tải trước khi bấm gallery; chỉ kích hoạt giao diện nếu nguồn đó không dùng được. Các cửa sổ video mới xuất hiện sau thao tác gallery cũng được theo dõi để đọc nguồn tải.

Ngày 30/10/2026, `npm run test:shopee:cdn` đã tải hoàn chỉnh hai video mẫu công khai qua bộ tải Electron thật, lần lượt 2.155.822 byte và 2.465.281 byte cho hai dạng ID trên; file tạm được xóa sau kiểm tra. Đây là kiểm tra CDN với video mẫu, chưa xác nhận tải đủ các sản phẩm của người dùng. `npm run test:shopee:electron` kiểm tra thêm gallery mở dialog rồi dialog mới nhận nguồn, đồng thời loại dialog đánh giá/đăng nhập không liên quan.

Khi tải, tool dùng phiên Shopee hiện tại, kiểm tra loại nội dung và phần đầu file trước khi tải tiếp. Bản 0.3.1 bỏ header `Referer` đặt thủ công: cách đặt này khiến Electron chặn yêu cầu ngay trên máy với `ERR_BLOCKED_BY_CLIENT`. Kiểm thử `test/shopee-electron-fetch.cjs` tái hiện lỗi cũ và xác minh bộ tải mới nhận đủ dữ liệu qua Electron thật với máy chủ localhost. Nếu một nguồn là ảnh/trang lỗi hoặc tải thất bại, tool thử các nguồn còn lại và tiếp tục dò nguồn phát mới; lỗi mạng tạm thời được thử lại tối đa một lần cho mỗi nguồn. Lỗi SSL protocol có thể thử lại, nhưng tool không bỏ kiểm tra chứng chỉ TLS. File tải thiếu hoặc phản hồi chỉ chứa một đoạn video không được lưu thành MP4 hoàn chỉnh. Tool bắt đầu dò ngay sau khi trang sẵn sàng, chỉ chờ thêm khi chưa tải được nguồn hợp lệ.

App tự kiểm tra nhãn **Hết hàng / Sold out / Out of stock** hiển thị trong phần thông tin sản phẩm trước khi tải hoặc dùng lại video cũ. Sản phẩm nhận diện hết hàng được bỏ qua, không thêm vào Excel của lượt tải hay nhập lại vào tool; thống kê cuối lượt có số sản phẩm hết hàng. Video và dữ liệu đã lưu từ trước được giữ nguyên. Việc nhận diện dựa trên giao diện Shopee, không phải kiểm tra tồn kho thời gian thực qua API.

Nếu hết lượt dò mà chưa lấy được nguồn, tool lưu `Shopee-chan-doan-SHOPID-ITEMID.json` trong thư mục Excel của lượt quét; đường dẫn xuất hiện trong **Sản phẩm bỏ qua**. File chỉ chứa cấu trúc các trường video và thành phần quanh trình phát, không lưu cookie, nội dung form, HTML đầy đủ hay URL tải có chữ ký. Bản 0.3.2 bổ sung bấm ảnh bìa nằm trực tiếp cạnh video ẩn trong khu vực ảnh sản phẩm, dựa trên cấu trúc ghi nhận trong các file chẩn đoán; không yêu cầu có biểu tượng SVG phát. Đã kiểm thử bố cục tái dựng bằng Electron, vẫn cần xác minh kết quả trên trang Shopee thực tế. Nếu API trả mã lỗi khác 0 và không có nguồn phát sẵn, tool báo lỗi API ngay thay vì đợi hết 20 lượt dò; không suy diễn mã lỗi thành sản phẩm không có video.

Khi chuyển sang trang đăng nhập, bộ quét tạm chờ (tối đa 10 phút), tiếp tục sau khi đăng nhập và trang tải xong. Dùng đăng nhập trực tiếp bằng số điện thoại/email hoặc mã QR Shopee; cửa sổ đăng nhập bên ngoài Shopee chưa được hỗ trợ. Nếu lượt quét lỗi, cửa sổ Shopee được giữ để hoàn tất đăng nhập; xem thông báo trong tool rồi bấm tải lại. Nếu chính tiến trình hiển thị Shopee bị dừng, tool hiển thị lý do/mã thoát thay vì chỉ đóng cửa sổ.

### Luồng nhanh

1. Nhập link shop, bấm tải và chọn thư mục video. App tự tạo thư mục con `Excel Shopee-…` cho mỗi lượt, chứa **Ten va Link SP.xlsx** (2 cột: Liên kết gốc, Tên sản phẩm) và **Shopee Affiliate.xlsx** (6 cột theo mẫu Shopee: Liên kết gốc, Sub_id1–Sub_id5). Dùng file thứ hai để upload lên Shopee Affiliate; file thứ nhất để đối chiếu trong tool. Không hỏi nơi lưu Excel, không ghi đè lượt cũ.
2. Link gốc và tên file của từng video tải thành công hoặc được nhận diện trong lịch sử tải tự lưu vào tool, giữ qua các lần mở app. Không cần upload lại Excel video.
3. Tải file đối chiếu affiliate lên. Nếu nhận diện được duy nhất sheet, dòng tiêu đề và hai cột link, app tự ghép và thêm vào Excel tổng. Nếu cấu trúc chưa rõ, chọn lại cột rồi bấm **Ghép**. File vẫn cần cả link sản phẩm gốc và link affiliate để đối chiếu chính xác.
4. Bảng **Lên lịch nhanh** tự điền caption tên video + link affiliate cho video khớp. Caption đã sửa thủ công được giữ. Chọn Page, kiểm tra video/caption và giờ đăng rồi bấm đăng. Việc ghép affiliate không tự đăng Facebook; bảng nhanh vẫn đăng toàn bộ video hiện có trong thư viện.

Video tải trước bản cập nhật có thể dùng **Dùng Excel video cũ thay cho dữ liệu tự lưu**, hoặc quét lại shop trong thư mục tải cũ để app nhận lịch sử. Dữ liệu link gốc tự lưu nằm trong database cục bộ; Excel tổng vẫn đồng bộ qua Git như hướng dẫn bên dưới.

Trong **Chọn video → Tải video shop Shopee**, nhập link như `https://shopee.vn/ipone_vietnam`, bấm **Tải video của shop** và chọn thư mục lưu. App mở cửa sổ Shopee riêng; đăng nhập hoặc xử lý CAPTCHA tại đó nếu được yêu cầu. Phiên đăng nhập Shopee được lưu riêng trong dữ liệu Electron. Đóng cửa sổ Shopee để dừng lượt quét; các video đã tải vẫn được giữ.

Hai file Excel được cập nhật sau từng video tải thành công hoặc nhận diện trong lịch sử. File **Shopee Affiliate.xlsx** dùng nguyên mẫu `desktop/templates/shopee-batch-custom-links.xlsx`, tab **Sheet1**, chỉ 6 cột A–F; các Sub_id mặc định để trống. **Ten va Link SP.xlsx** chỉ có 2 cột; cột tên sản phẩm giữ tên gốc đầy đủ đọc từ Shopee, không phụ thuộc tên file video. Đóng cả hai file trong Excel khi đang tải. Nếu ghi một file lỗi, lượt tải dừng; hai file có thể khác nhau ở dòng mới nhất, video đã tải vẫn được giữ.

Bản 0.3.8 bỏ giới hạn cố định 100 ký tự của tên video. Tên file mới được giữ dài nhất có thể trong giới hạn đường dẫn tương thích Windows, có chừa chỗ cho đuôi `.mp4`, số thứ tự khi trùng tên và thư mục `video đã đăng`. Tên sản phẩm gốc được lưu riêng trong dữ liệu thư viện; nút **Lấy tên video làm caption** ưu tiên tên gốc này để không mất phần cuối khi tên file buộc phải rút gọn. Các video cũ giữ tên file hiện có; dữ liệu tên gốc đã lưu theo đúng đường dẫn sẽ được phục hồi khi mở app/nhập lại video. Video không có dữ liệu nguồn Shopee vẫn dùng tên file để tạo caption. Bài Facebook đã đăng không bị sửa caption tự động.

Tool cuộn trang, thử chuyển trang và gom link sản phẩm, nhận diện biểu tượng `.shopee_ic .stroke-none` (kèm biến thể cùng phần tử). Tool kiểm tra cả các sản phẩm không có biểu tượng để tránh phụ thuộc hoàn toàn vào class. Mỗi sản phẩm được mở để đọc nguồn MP4 từ video hoặc tài nguyên đã tải. Video lưu bằng tiêu đề sản phẩm, giữ tiếng Việt, thay ký tự không hợp lệ trên Windows; tên trùng được thêm số. File tải hoàn chỉnh được tự thêm vào thư viện. File tạm được xóa khi tải lỗi; không ghi đè video có sẵn. Tool gom sản phẩm theo cặp ID shop/sản phẩm nên các biến thể link của cùng sản phẩm chỉ được kiểm tra một lần. Lịch sử tải được lưu trong `.shopee-downloads.json` tại thư mục lưu video. Khi chạy lại cùng thư mục, nếu file đã tải còn nguyên metadata và MP4 hợp lệ (ở thư mục đó hoặc `video đã đăng`), tool bỏ qua tải mạng, ghi lại dòng vào Excel và tăng số **đã có**. Nếu file mất hoặc thay đổi, tool tải lại. Các video từ phiên bản cũ chưa có lịch sử không được tự nhận diện hoặc xóa; lần tải đầu sau cập nhật có thể vẫn tạo file tên có số. Hai sản phẩm khác ID dùng cùng nội dung video vẫn được giữ riêng để đối chiếu đúng link affiliate.

Đây là tính năng thử nghiệm, **chưa xác minh tải thành công với shop thật**. Kiểm tra trực tiếp hai link lỗi ngày 29/10/2026 bằng phiên mới bị Shopee chuyển đến `/verify/traffic/error` (API error `90309999`), nên vẫn cần kiểm chứng bằng phiên đã đăng nhập của người dùng. Shopee có thể đổi DOM, yêu cầu đăng nhập, chặn trình duyệt hoặc chỉ tải video sau tương tác; nguồn blob/HLS không có MP4 trực tiếp chưa được hỗ trợ. Không cam kết lấy đủ toàn bộ video. Giới hạn mỗi lượt: 100 trang, 60 lần cuộn/trang và 1 GB/video; video không tìm được nguồn sẽ được bỏ qua, lỗi tải được hiển thị trong giao diện. Bản `npm start` không có cửa sổ Shopee; dùng `npm run desktop` sau khi cài dependencies hoặc build lại `.exe` để dùng chức năng này.

## Bình luận affiliate trên bài Page đã đăng (thử nghiệm)

Tab **Bình luận affiliate** hoạt động độc lập với tab Ứng dụng và tab File tổng. Chọn Page đã kết nối, nhập số bài tối đa cần quét (1–5.000, mặc định 100), rồi bấm **Quét và đối chiếu**. Quét chỉ đọc dữ liệu; chưa gửi bình luận. Bảng hiển thị caption, tên sản phẩm/dòng Excel, nguyên văn cột **Nội dung**, trạng thái và lý do bỏ qua. Chỉ các dòng đủ điều kiện mới chọn được. Bấm **Đăng bình luận đã chọn**, kiểm tra số bài và tên Page trong xác nhận để gửi. Nên thử một bài trước; không cần chọn toàn bộ bảng. Giữ app mở, dùng **Dừng** để dừng sau yêu cầu Meta đang xử lý.

Đối chiếu theo toàn bộ caption hoặc dòng tên sản phẩm ở đầu; có thể bỏ phần đuôi chỉ gồm URL/hashtag. Chuẩn hóa Unicode, khoảng trắng và chữ hoa/thường, giữ dấu tiếng Việt; không tìm gần đúng bằng tên chứa một phần. Tên trùng nhưng link/nội dung khác nhau sẽ báo khớp nhiều dòng. Cột D phải chứa link affiliate hợp lệ ở cột C. File Excel tổng chỉ được đọc; nếu file đổi sau khi xem trước, phải quét lại.

Tool kiểm tra bình luận theo **ID Page**, bao gồm các trang bình luận và luồng trả lời; bình luận của người khác không chặn bài. Bài đã có bất kỳ bình luận/trả lời nào của Page đều bị bỏ qua. Trước mỗi lần gửi, tool đọc lại bài và bình luận để tránh trường hợp Page đã bình luận sau lượt quét. Nếu thiếu tác giả, thiếu trang dữ liệu hoặc API lỗi, bài được báo chưa kiểm tra chắc chắn và không gửi. Từng bài có lịch sử theo cặp Page ID/bài ID trong SQLite; trường hợp đang gửi mà app dừng/mất phản hồi sẽ cần kiểm tra Facebook, không tự gửi lại. Lỗi gửi làm dừng lượt, không tự thử lại POST.

Kết nối Facebook yêu cầu thêm `pages_manage_engagement` và `pages_read_user_content` bên cạnh các quyền đăng bài hiện có. Token cấp trước khi thêm quyền có thể cần kết nối lại. Quét dùng `published_posts` và `comments` theo các edge trong [SDK chính thức của Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py). Chỉ xử lý các bài API trả về; chưa xác minh độ bao phủ Reels/bài cũ và quyền thực tế trên Page thật. Kiểm thử hiện dùng dữ liệu/API giả lập, chưa đăng bình luận thật lên Facebook. Khoảng cách giữa các bình luận chọn được từ 5–300 giây.

Nếu đọc được danh sách bài nhưng từng bài báo `Meta API: 10` khi đọc bình luận, bản 0.3.7 hiển thị riêng **Thiếu quyền đọc bình luận** khi phản hồi Meta yêu cầu `pages_read_user_content`. Quyền tạo/quản lý bình luận `pages_manage_engagement` không thay thế quyền đọc này. Kiểm tra quyền trong Meta App, kết nối lại Facebook cho đúng Page rồi quét lại. Không bỏ qua lỗi này để tự coi bài là chưa có bình luận của Page. Kiểm tra chỉ đọc ngày 30/10/2026 xác nhận token đúng Page vẫn có thể bị từ chối cả truy vấn bình luận tối giản vì thiếu quyền đọc; chưa thực hiện bình luận thật.

## Ghép link Shopee Affiliate vào Excel tổng hợp cố định

Tab **File tổng · Chỉ xem** ở đầu ứng dụng hiển thị dữ liệu trang `sheet 1` trong `Tong-hop-affiliate.xlsx`: Liên kết gốc, Tên sản phẩm, Link affiliate, Nội dung. Tìm kiếm trên cả bốn cột bằng nút **Tìm kiếm** hoặc Enter; hỗ trợ tiếng Việt không dấu, phân trang 100 dòng và **Làm mới** sau khi file thay đổi. Tab này chỉ đọc, không tạo/sửa/lưu file Excel và không có thao tác chỉnh sửa ô. Chuyển qua lại tab **Ứng dụng** giữ nội dung đang nhập và tiến trình đang chạy.

Nút **Mở thư mục file link sản phẩm** trong mục **Ghép link Shopee Affiliate** mở thư mục và chọn sẵn `Shopee Affiliate.xlsx` của lượt tải gần nhất để upload lên Shopee lấy link affiliate. App nhớ vị trí qua các lần mở; khi nâng cấp từ bản cũ, app tìm file xuất trong các thư mục video đã tải. Đợi lượt tải kết thúc để lấy file đầy đủ. Nếu file đã bị di chuyển/xóa, app báo không tìm thấy thay vì mở nhầm file Excel tổng.

Sau khi tải video và có file đối chiếu từ Shopee, mở **Ghép link Shopee Affiliate**:

1. App mặc định dùng dữ liệu video Shopee tự lưu. Để nhập tay, bật **Dùng Excel video cũ thay cho dữ liệu tự lưu** rồi chọn **Ten va Link SP.xlsx** (A: Liên kết gốc, B: Tên sản phẩm). Vẫn đọc được Excel 7 cột của phiên bản cũ.
2. Chọn file Shopee có cả link sản phẩm gốc và link affiliate. Hai file đầu vào hỗ trợ `.xlsx` và `.csv` UTF-8 (dấu phẩy/chấm phẩy), tối đa 20 MB/file; `.xls` cần lưu lại thành `.xlsx` trước.
3. App tự nhận diện và ghép khi cấu trúc file affiliate rõ ràng. Nếu chưa nhận diện được duy nhất, chọn sheet, dòng tiêu đề (trong 30 dòng đầu), cột link gốc và cột affiliate rồi bấm Ghép. Có thể kiểm tra và đổi lựa chọn trong phần cột.
4. App tự tạo **Tong-hop-affiliate.xlsx** trong thư mục dữ liệu (`data/`), giữ qua các lần mở. Nếu đã chọn file tổng ở phiên bản cũ, app sao chép file đó một lần, giữ nguyên bản gốc. Nếu file cũ không đọc được, cần khôi phục file đó trước khi tiếp tục.
5. Đóng file tổng trong Excel, bấm **Ghép và thêm vào file tổng hợp**. Bấm **Tải bản sao Excel tổng** để lấy bản sao ra ngoài.

Khi chạy từ repo bằng `npm start` (DATA_DIR mặc định) hoặc `npm run desktop`, file tổng nằm tại **data/Tong-hop-affiliate.xlsx** trong repo và được phép đưa lên Git. Bản `.exe` đã đóng gói vẫn lưu trong **Mở thư mục dữ liệu → data**, không tự đồng bộ với repo.

### Mang Excel tổng sang máy khác bằng Git

Đóng app và Excel trước khi đồng bộ. Sau khi ghép xong trên máy hiện tại:

```sh
git add data/Tong-hop-affiliate.xlsx
git commit -m "Update affiliate master workbook"
git push
```

Máy khác chạy `git pull` trước khi mở app từ mã nguồn; app dùng ngay Excel tổng vừa kéo về. Lần đầu cần cài dependencies bằng `npm ci`. Các thay đổi mã nguồn hỗ trợ tính năng này cũng cần được commit/push cùng lần đầu.

Đồng bộ lần lượt từng máy: push ở máy đang dùng, rồi pull ở máy tiếp theo trước khi sửa. Excel là file nhị phân, Git không tự ghép nội dung nếu hai máy sửa đồng thời. File đưa lên Git chứa tên sản phẩm và link affiliate, người có quyền đọc repo sẽ xem được. Chỉ Excel tổng đi theo Git; `.env`, database, tài khoản Facebook, lịch đăng và video không được đồng bộ. Với bản `.exe`, sao chép file tổng giữa repo và thư mục dữ liệu của app khi cần đồng bộ.

Tab **sheet 1** có đúng 4 cột: **A: Liên kết gốc**, **B: Tên sản phẩm**, **C: Link affiliate**, **D: Nội dung**. Cột D là tên sản phẩm + ký tự xuống dòng + link affiliate, có bật Wrap Text. File tổng hợp không có các cột Sub_id; Excel video đầu vào vẫn giữ định dạng 7 cột để dùng chuyển đổi affiliate. Chỉ thêm các dòng có tên sản phẩm và ghép được duy nhất một link affiliate hợp lệ. Tab `sheet 1` đã có phải có đúng tiêu đề A–D; các tab khác và dòng cũ được giữ. Nếu file có tab `Tổng hợp sản phẩm` của phiên bản cũ, tab đó được giữ; các lượt mới ghi vào `sheet 1`. File nguồn hai bên không bị sửa. Tool đọc lại file tổng hợp mỗi lượt và ghi qua file tạm rồi thay thế file đích khi hoàn tất; nếu file bị khóa hoặc vừa thay đổi bên ngoài thì báo lỗi.


Ghép bằng cặp ID shop/sản phẩm: URL dạng `…-i.SHOPID.ITEMID` và `/product/SHOPID/ITEMID` vẫn khớp khi khác slug/tham số. Link gốc rút gọn cần thay bằng URL sản phẩm đầy đủ. Dòng chưa khớp hoặc có nhiều affiliate khác nhau không được thêm vào tổng hợp; tổng số từng loại được hiển thị sau khi ghép. Dòng đã có cùng sản phẩm, tên video và affiliate được bỏ qua; thay đổi một trong các giá trị này được coi là bản ghi mới. Các Sub_id không được đưa vào file tổng hợp.

Tool chỉ sao chép affiliate từ file bạn cung cấp, không tự chuyển đổi link và chưa tự comment lên Facebook. Dữ liệu hai file nguồn được xử lý trên máy chạy tool, giữ trong bộ nhớ tối đa 30 phút (tối đa 8 file/phiên thời gian này); hết phiên cần chọn lại. File tổng hợp tối đa 50 MB. Sao lưu file tổng cùng thư mục dữ liệu khi chuyển máy.

## Dữ liệu lưu ở đâu?

Khi thêm video, tool tạo thư mục con **`video đã đăng`** ngay trong thư mục chứa từng file. File vẫn ở vị trí ban đầu cho tới khi tạo lịch thành công. Khi lưu lịch (từng video, hàng loạt hoặc Lên lịch nhanh/Đăng ngay), tool chuyển video vào thư mục con này, giữ nguyên tên và nội dung, đồng thời cập nhật đường dẫn trong database để tải lên Meta. Video nhập từ nhiều thư mục được chuyển vào thư mục con tương ứng của từng nơi. Video đã nằm trong `video đã đăng` sẽ không bị chuyển thêm một tầng.

**Tên thư mục thể hiện video đã được xếp lịch, không xác nhận đã xuất bản trên Facebook.** Hủy lịch hoặc bài lỗi không tự chuyển file về chỗ cũ. Chọn lại video trong thư mục này để nhập lại nếu cần; quét thư mục cha không quét đệ quy nên không nhập lại các video đã chuyển. Nếu đích đã có file cùng tên, tool từ chối lượt tạo lịch để tránh ghi đè hoặc làm sai tên đối chiếu Excel. Lỗi chuẩn bị file khiến lượt tạo lịch bị hủy; file gốc vẫn được giữ. Tool sao chép file hoàn chỉnh, lưu đường dẫn/lịch, sau đó xóa bản cũ nên ổ đĩa cần đủ dung lượng tạm cho các video trong lượt. Nếu không xóa được bản cũ, lịch vẫn được lưu với đường dẫn mới và tool hiện cảnh báo bản trùng cần xử lý. Nếu app dừng bất ngờ, có thể còn bản sao ở hai nơi; kiểm tra đường dẫn trong tool trước khi xử lý bản trùng.

Xóa khỏi thư viện, hủy lịch và Clear lịch sử không xóa file video. Không tự di chuyển/đổi tên/chỉnh sửa video ở đường dẫn mới trong lúc chờ tải lên. `data/reels.sqlite` lưu đường dẫn hiện tại, metadata video, caption, lịch, trạng thái và token Page đã mã hóa. Video từ bản upload cũ không có đường dẫn gốc vẫn ở `data/` và không tự chuyển. Sao lưu SQLite, khóa mã hóa và video riêng; không commit `.env` hoặc `data/`.

## Xóa video tải trùng

**Dọn nhanh video trùng (1), (2)…** trong Thư viện video: bấm nút, chọn thư mục, rồi xác nhận một lần. App tự quét cả thư mục con, so sánh nội dung và xóa tất cả bản trùng đủ điều kiện; không cần tick từng file. Hủy chọn thư mục hoặc hủy xác nhận sẽ không xóa gì. Video khác nội dung, bản duy nhất còn lại và video có lịch đăng/lịch sử đăng được giữ. Kết quả hiển thị số file đã xóa và các file phải bỏ qua. Chức năng chỉ xóa video MP4/MOV có đuôi số và nội dung giống hệt bản được giữ lại, không xóa mọi file chỉ vì tên có `(1)` hoặc `(2)`.

Mở **Thư viện video → Xóa video trùng trên máy**, chọn thư mục (hoặc nhập đường dẫn), bấm **Tìm video trùng**. Tool quét cả thư mục con, gồm `video đã đăng`, không đi theo symlink, tối đa 10000 video/lượt. Các file như `Tên.mp4`, `Tên (1).mp4`, `Tên (2).mp4` được nhóm theo tên cơ sở và phần mở rộng, rồi so sánh SHA-256. Chỉ file có đuôi số và giống hệt nội dung một file được giữ lại mới được đưa vào danh sách xóa; file khác nội dung giữ nguyên. Nếu không có tên gốc, giữ bản có số nhỏ nhất. File có lịch đăng hoặc lịch sử đăng (kể cả đã hủy) được giữ lại.

Danh sách hiển thị đường dẫn **Xóa / Giữ**; có thể bỏ chọn từng file. Bấm **Xóa các bản trùng đã chọn** và xác nhận để xóa file thật, vĩnh viễn, không qua Thùng rác. Tool kiểm tra lại nội dung và lịch đăng trước khi xóa, đồng thời bỏ bản trùng khỏi thư viện. Danh sách hết hạn sau 10 phút; file đã đổi/mất hoặc vừa được lên lịch sẽ được bỏ qua. Excel cũ và lịch sử tải Shopee không tự chỉnh tên theo file giữ lại; nếu chúng tham chiếu bản vừa xóa thì cần đối chiếu lại. Không dùng nút này trong lúc tải Shopee.

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

Nút **Clear lịch sử** trong **Lịch xuất bản** xóa các dòng đã xuất bản hoặc đã hủy sau khi xác nhận. Giữ nguyên bài đang chờ, đang upload/xử lý và cần kiểm tra; không xóa video gốc, dữ liệu thư viện hay bài trên Facebook. Bộ đếm đã xuất bản sẽ chỉ tính các dòng lịch sử còn lại.

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

Khoảng cách bình luận được cộng/trừ ngẫu nhiên 10 giây sau mỗi lần gửi, tối thiểu 5 giây (ví dụ nhập 60 giây thì chờ 50–70 giây). Ô tick ở đầu cột chọn bài áp dụng cho toàn bộ kết quả quét, kể cả các trang tiếp theo; bỏ tick để bỏ chọn tất cả.

Lượt quét bình luận yêu cầu Meta trả bài mới nhất trước và bảng giữ nguyên thứ tự mới nhất xuống cũ nhất qua các trang. Nhập 10 thì chỉ xét 10 bài mới nhất API trả về (hoặc ít hơn nếu Page có ít bài hơn). Bài đã có bình luận của Page hoặc không khớp Excel vẫn tính trong giới hạn; không quét bài cũ để bù số bài đủ điều kiện.
