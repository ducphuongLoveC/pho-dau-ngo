# Phở Đầu Ngõ

Game quản lý quán phở 2D bằng **TypeScript + Phaser 3 + Vite**. Giao diện và lời khách bằng tiếng Việt; dùng chuột hoặc chạm để nấu và phục vụ.

## Chạy dự án

Yêu cầu Node.js 22.18 trở lên.

```bash
npm install
npm run dev
```

Mở địa chỉ Vite in ra, mặc định `http://localhost:5173`. Máy khác trong cùng mạng có thể mở địa chỉ Network của Vite. Bản production:

```bash
npm run build
npm run preview
```

## Đưa game lên Vercel

Dự án đã có `vercel.json`: cài bằng `npm ci`, build bằng `npm run build`, xuất website từ `dist`. Bản hiện tại không cần database hoặc biến môi trường.

Từ thư mục dự án, đăng nhập tài khoản của bạn rồi triển khai:

```bash
npx vercel login
npx vercel --prod --archive=tgz
```

Lần đầu, chọn tài khoản/team của bạn, tạo project `pho-dau-ngo` và dùng thư mục hiện tại (`./`). CLI sẽ trả về địa chỉ chơi sau khi triển khai thành công. Những lần cập nhật sau, chạy lại `npx vercel --prod --archive=tgz` trong cùng thư mục. Tùy chọn archive gom mã nguồn trước khi tải lên; `.vercelignore` loại các bản build tại máy, ảnh kiểm thử và tệp môi trường khỏi gói này.

Nếu import qua Git trên dashboard, chọn framework **Vite** và root là thư mục chứa `package.json`; cấu hình build đã nằm trong `vercel.json`. Hướng dẫn chính thức: [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite).

Tiến trình vẫn lưu trong localStorage của từng trình duyệt theo địa chỉ website. Bản lưu ở localhost không tự chuyển sang tên miền Vercel; triển khai website chưa tạo đồng bộ giữa các thiết bị.

## Có thể chơi gì?

- Nhập nguyên liệu, nấu nước dùng và mở ca bán hàng.
- Chạm trực tiếp vào rổ bánh, khay thịt và chén gia vị trên mặt quầy để lấy nguyên liệu. Nhãn nhỏ trên khay ghi số phần còn lại; nút “Xem kho” nằm ở góc quầy.
- Quầy phở gia đình với biển chữ đỏ, bảng giá theo công thức trong game, nồi nhôm trên bếp gas, bát sứ viền xanh, ống đũa, một kệ kính mở ba tầng: tầng trên bày bát đũa và rổ quẩy, tầng giữa bày bánh phở và thịt, tầng dưới bày hành rau và gia vị. Lời gọi món dùng cách xưng hô theo tên khách.
- Phở tái, phở chín; từ ngày 2 có ít bánh/không hành, từ ngày 3 có thêm ớt.
- Ngay ngày đầu, khách có thể gọi thêm một miếng chanh hoặc một phần quẩy nếu quán còn hàng. Chanh không phụ thu. Một phần quẩy gồm 2 cái, nhập 2.500đ và bán kèm 5.000đ; chạm rổ ở góc trên bên trái để đặt đĩa quẩy cạnh bát, giao cùng phở. Thiếu quẩy, khách sẽ nhờ bổ sung trước khi trả tiền.
- Nhập theo dự báo đã gồm chanh và quẩy (129.000đ cho ngày đầu, khi kho trống). Có thể nhập thêm hai món này trong Xem kho giữa ca; khách mới chỉ gọi phần còn đủ hàng. Mẻ nhỏ bốn bát vẫn giữ mức 54.000đ. Quẩy còn lại được giữ tới hết ngày tiếp theo.
- Tám khách ngày đầu; mỗi ngày tăng hai khách, tối đa 20 khách.
- Chạm chồng bát ở tầng trên của kệ kính để lấy một bát sạch vào khay giữa, thêm bánh, trụng, ráp món rồi giao. Giao hoặc bỏ bát xong phải lấy bát mới; lấy bát không tốn tiền. Trụng ngon ở khoảng 3–5 giây, mở rộng thành 3–7 giây khi có giỏ giữ nhiệt.
- Khách có kiên nhẫn, một lượt trả món để sửa, tiền tip và phản hồi lỗi.
- Tồn kho theo lô, hạn dùng, nguyên liệu trong bát, món bỏ, nước dư, thu chi đối soát.
- Lộ trình mở khóa có tiến độ và thông báo khi đạt mốc: 5 khách mở bảng thực đơn (+5 giây chờ, 40.000đ), 18 khách mở giỏ trụng giữ nhiệt (180.000đ), ngày 4 mở nồi 7,5 lít (260.000đ), 35 khách mở bếp nấu nước 10 giây (160.000đ), 60 khách mở góc trà đá (+10 giây chờ, 220.000đ). Đạt mốc mở quyền mua; trang bị mua trước hoặc sau ca và dùng lâu dài.
- Danh hiệu tự tăng theo tổng khách đã phục vụ, giữ qua các ngày. Đạt 100 khách nhận “Quán ruột của phố” cùng huy hiệu vàng cạnh tên quán, không tốn tiền. Mục Nâng cấp và sổ cuối ca nhắc mục tiêu tiếp theo; bản lưu cũ giữ nguyên tiền, tiến độ và trang bị đã mua.
- Lưu tự động trên trình duyệt sau thao tác và mỗi hai giây. Rời tab, mở hướng dẫn hoặc sổ sách sẽ tạm dừng ca.
- Hỗ trợ vốn một lần mỗi ngày nếu quán cạn tiền và không đủ nguyên liệu tiếp tục. Khi không đủ tiền nhập cả ca, nút nhập hàng tự chuyển sang mẻ nhỏ bốn bát (54.000đ trước khi trừ tồn kho).
- Âm thanh thao tác tổng hợp tại chỗ; có nút tắt âm thanh.
- Hiệu ứng lấy bát từ kệ ra quầy, thả nguyên liệu, chan nước, nhấc giỏ và giao bát; hỗ trợ cài đặt giảm chuyển động của thiết bị.
- Trên điện thoại, phiếu món hiển thị lượng nguyên liệu và dấu tích. Thanh dưới quầy nhắc bước tiếp theo; nút “Cách làm” mở hướng dẫn theo đúng món khách gọi và tạm dừng ca trong lúc đọc.
- Thanh hướng dẫn/giao món nằm trong bố cục bên dưới quầy để không che nút trụng, nhấc giỏ. Thông báo ngắn trên điện thoại xuất hiện ở đầu màn hình, không chặn chạm và tự ẩn sau 2,2 giây; thông báo lỗi giữ 4,2 giây để đọc.
- Nhập nguyên liệu cập nhật số lượng ngay trong dialog, giữ vị trí cuộn và nút đang bấm. Nhãn trên nồi giữ đúng kích thước và vị trí trên màn hình mật độ điểm ảnh cao.
- Khi bán trên điện thoại, phiếu món thu gọn nhưng vẫn hiện định lượng và yêu cầu đặc biệt. Bấm “Chi tiết” để xem tiến độ từng nguyên liệu; nút “Xem kho” nằm cùng hàng khách để quầy và các nút nấu gần nhau hơn.
- Khi cạn nước giữa ca, chạm nồi hoặc nút “Nấu nước”. Có thể nấu mẻ nhỏ từ nền còn trong kho; hết nền thì nhập tối đa 1.500 ml với giá 1.000đ / 150 ml, tùy tiền và chỗ trống. Giá hiện trước khi bấm, mẻ nấu mất 15 giây (10 giây khi có bếp nâng cấp) và được giữ lại khi tải lại trang. Quán không tự kết ca chỉ vì thiếu nước nếu vẫn có thể nhập thêm để phục vụ.

Mỗi tô thường: bánh 2 phần, thịt đúng loại 2 phần, nước 2 vá, hành lá/hành tây/rau thơm mỗi loại 1 phần. Đọc phiếu để bỏ hành, giảm bánh, thêm chanh hoặc lấy quẩy. Tương có trên quầy để thử nhưng chưa có khách yêu cầu; thêm không đúng phiếu bị giảm điểm.

Bản lưu phiên bản 5 giữ nguyên tiền, tiến độ và yêu cầu của các khách đang chờ trong bản cũ; không tự thêm yêu cầu chanh/quẩy vào món đang làm. Với quán cũ, nhập thêm chanh/quẩy hoặc dùng nhập theo dự báo ở ca sau để khách mới có thể gọi.

Đây là prototype có vòng lặp nhiều ngày. Bò viên, phở đặc biệt, món bún, nhân viên và trang trí chưa được triển khai. Giá tiền là dữ liệu cân bằng trò chơi. Bản đầu không có tài khoản, đồng bộ máy chủ hoặc mua hàng bằng tiền thật.

## Kiểm thử

```bash
npm test
npm run build
```

Kiểm thử trình duyệt bằng Chrome/Chromium đã cài, trong lúc dev server đang chạy:

```bash
node tests/browser-smoke.mjs
```

Kiểm tra hướng dẫn điện thoại ở 320/390 px, các yêu cầu ít bánh/không hành/thêm ớt, lấy bát và tải lại bản lưu trong trình duyệt kiểm thử riêng:

```bash
GAME_URL=http://localhost:5173 node tests/mobile-guide-smoke.mjs
```

Kiểm tra mua liên tiếp trong dialog, giữ focus/vị trí cuộn, hết tiền, lưu lại kho và nhãn quầy ở mật độ điểm ảnh 1×/2×/3×:

```bash
GAME_URL=http://localhost:5173 node tests/stock-labels-smoke.mjs
```

Kiểm tra khách gọi chanh/quẩy, sửa món thiếu quẩy, đĩa ăn kèm, lưu lại món, giá bán và nhập thêm giữa ca trên mobile/desktop:

```bash
GAME_URL=http://localhost:5173 node tests/quay-lime-smoke.mjs
```

Kiểm tra nấu thêm giữa ca, mẻ nhỏ, nhập nền khi hết kho, đếm ngược, tạm dừng và tải lại mẻ đang nấu:

```bash
GAME_URL=http://localhost:5173 node tests/broth-refill-smoke.mjs
```

Kiểm tra mốc mở khóa, thông báo, mua trang bị, danh hiệu 100 khách, tác dụng nâng cấp, bản lưu cũ và bố cục mobile:

```bash
GAME_URL=http://localhost:5173 node tests/progression-smoke.mjs
```

Mặc định `browser-smoke.mjs` chơi đủ tám khách theo đồng hồ thật (~3–4 phút), kiểm tra lưu/khôi phục, tạm dừng, thu chi và quầy nguyên liệu trên máy tính, máy tính bảng và điện thoại. Có thể đặt `CHROME_PATH` cho vị trí Chrome, `GAME_URL` cho URL khác, hoặc `FULL_DAY=0` để chạy ca rút gọn. Ảnh kiểm tra được lưu tại `artifacts/`.

Đo hiệu năng và kiểm tra bấm nhanh bằng chuột/chạm:

```bash
GAME_URL=http://localhost:5173 QA_LABEL=current node tests/performance-smoke.mjs
GAME_URL=http://localhost:5173 node tests/canvas-lifecycle-smoke.mjs
```

Script ghi nhịp khung hình của trình duyệt, tác vụ dài, thay đổi DOM và phản hồi thao tác vào `artifacts/performance-current.json`. Khi so sánh hai bản, dùng cùng Chrome, máy và tùy chọn chạy. Script chặn phông chữ từ xa để tránh sai lệch do mạng; số đo trình duyệt headless không đại diện cho mọi thiết bị.

Kiểm thử vòng đời canvas kiểm tra tạm dừng/tiếp tục khi trụng, giao tô cuối trong ca đóng cửa và chuyển ngày không còn hiệu ứng bát cũ.

## Cấu trúc

- `src/engine.ts`: toàn bộ luật chơi, trạng thái, tính tiền, kiểm tra bản lưu; không phụ thuộc UI.
- `src/kitchen.ts`: quầy bếp Phaser Canvas, cache hình và chữ ở độ phân giải 2–3 lần theo kích thước màn hình để nét trên desktop, tái sử dụng sprite hiệu ứng và nghỉ vẽ khi tạm dừng.
- `src/counter-layout.ts`: tọa độ chung cho khay nguyên liệu được vẽ trên quầy và các vùng chạm/bàn phím tương ứng.
- `src/main.ts`: giao diện HTML, các màn hình, lưu game, âm thanh và kết nối engine.
- `src/icons.ts`: hình vector nguyên liệu và nhân vật.
- `src/style.css`: bố cục máy tính/điện thoại.
- `test/engine.test.ts`: các kiểm thử nghiệp vụ.
- `tests/browser-smoke.mjs`: kiểm thử thao tác trên trình duyệt.
- `tests/performance-smoke.mjs`: đo hiệu năng và kiểm tra thao tác chuột/chạm liên tiếp.
- `tests/canvas-lifecycle-smoke.mjs`: kiểm tra tạm dừng và dọn hiệu ứng khi chuyển ngày.

Lưu game dùng khóa `pho-dau-ngo.save.v1` trong localStorage của origin đang chơi. Nút “Chơi lại từ đầu” yêu cầu xác nhận trước khi thay tiến trình. Nếu trình duyệt chặn lưu trữ, game vẫn chạy trong phiên hiện tại và hiển thị trạng thái không thể lưu. Bản lưu lỗi được sao lưu tại khóa `pho-dau-ngo.save.v1.backup` trước khi tạo quán mới; nếu không thể giữ bản sao, game không ghi đè dữ liệu cũ.

Bản lưu phiên bản 1 và 2 tự chuyển sang phiên bản 4 trên cùng khóa localStorage: giữ bát đang làm (ưu tiên bát đang chọn), hoàn nguyên liệu của bát còn lại về kho và giữ nguyên tiền, sổ thu chi, nâng cấp. Nước trong bát hoàn về nền nước dùng để nấu lại. Giỏ thứ hai đã mua được đổi sang giỏ giữ nhiệt miễn phí.


Bản lưu phiên bản 3 được kiểm tra sổ thu chi trước khi chuyển sang phiên bản 4. Ba loại nước uống đã được bỏ: hàng chưa bán (kể cả chai/lon đang đặt cạnh bát) được hoàn đúng giá nhập vào két, ghi riêng ở dòng tiền hoàn hàng; doanh thu đã bán được giữ nguyên. Đơn đang chờ chuyển về yêu cầu phở, bát đang làm, nâng cấp và tiến độ được giữ. Hoàn tiền chỉ diễn ra một lần.

Bát sạch trên tầng trên dùng cùng tỉ lệ miệng/thân như bát đang làm, xếp lồng ba chiếc. Vùng chạm lấy bát và hoạt ảnh lấy bát cùng xuất phát từ tầng trên; không còn kệ bát cạnh nồi trụng. Canvas giữ kích thước cũ nên không tăng chiều cao trang trên điện thoại.

Kiểm tra kệ ba tầng, vùng chạm mới và chuyển bản lưu phiên bản 3 trên desktop/mobile:

```bash
GAME_URL=http://localhost:4173 node tests/three-tier-shelf-smoke.mjs
```

Giao diện Hà Nội xưa dùng tường vàng vôi, cửa xanh rêu, biển men chữ đỏ,
quầy và ghế gỗ, nền gạch đất nung. Thành trước của nồi trụng là một lớp nhôm
đục đặt phía trên giỏ chuyển động, che phần lưới nằm dưới mép nồi trong cả
hoạt ảnh hạ/nhấc, tải lại và chế độ giảm chuyển động.

Kiểm tra ảnh thực tế của thành nồi trong hoạt ảnh, trụng đúng thời gian và
bố cục 320/390/1440 px (ảnh kiểm tra lưu tại `artifacts/hanoi-*.png`):

```bash
GAME_URL=http://localhost:5173 node tests/hanoi-basket-smoke.mjs
```
