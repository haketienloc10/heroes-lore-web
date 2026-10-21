# SCN-0006 — Save/load và vòng đời tiến trình

**Bản gốc:** đã quan sát Save qua UI và load ở PID mới với hai trạng thái; **chưa đạt toàn bộ**, thiếu 3 chu kỳ save/load độc lập mỗi biến thể và trace RMS. **Web:** chưa chạy. JAR/hash, P1, 3 lượt/biến thể và snapshot theo [quy trình](J2ME-RUNTIME-PROTOCOL.md); dùng [mẫu run](RUN_TEMPLATE.md).

## Điều kiện

Có fixture gameplay SCN-0005; đường save/load đã được khám phá ở lượt tiếp tục: W → tab System → Save; startup có save chọn Load Game → Ronin. Biên bản/evidence ở cuối tài liệu. Không giả định có autosave, nhiều slot, hay save ở mọi map. Có thể xem lời gọi RMS để tìm mốc, nhưng file đổi không chứng minh UI đã save đúng.

Source JADX `at.java:24–34,41–60,71–77,88–108` có các lời gọi `RecordStore` và thay `/` bằng `_` trong tên. Đây là định hướng tĩnh, đã lưu bytecode `at` trong evidence M1.5; chưa xác minh save schema hoặc thời điểm game quyết định ghi. Không lấy tên `/c` hay `/o` làm tên slot gameplay chỉ từ chuỗi.

## Biến thể bắt buộc

**A — Lưu rồi khởi động lại tiến trình:**

1. Tạo trạng thái S0: chụp nhân vật/map/vị trí, HP/MP, level/EXP, tiền, item/trang bị và lựa chọn ngôn ngữ nếu UI hiển thị; trường không đọc được ghi không biết.
2. Dùng đường UI save đã ghi; thời gian `t_save` là input xác nhận. Không input tối thiểu 2 giây và chờ dấu hiệu hoàn tất có quan sát; 2 giây không tự bảo đảm flush. Trace RMS open/add/set/delete/close và exception, chụp thông báo nếu có.
3. Thoát bình thường bằng UI, chờ emulator/process dừng rồi snapshot toàn bộ dữ liệu RMS liên quan và config. Ghi đường, kích thước/hash từng file, suite identity và timestamp. Không copy khi còn ghi.
4. Relaunch cùng JAR identity/profile/storage; đi vào load/continue theo UI; không chỉ chuyển menu trong cùng tiến trình. Chụp bảng S1 và so với S0 từng trường. Ghi trường nào không được thiết kế lưu là chưa biết cho đến có bằng chứng.
5. Tạo lại từ fixture S0 cho hai lượt tiếp, tránh “test load” bằng RAM còn sống.

**B — Lưu trạng thái khác và kiểm tra khả năng ghi đè:**

Từ S0, tạo S2 bằng một thay đổi quan sát được (ví dụ vị trí và một thuộc tính UI khi có thao tác hợp lệ), ghi chính xác input; save qua cùng đường UI, dừng tiến trình/snapshot/relaunch/load như A. So sánh với S2 và S0. Chỉ gọi là overwrite cùng slot khi UI hoặc trace đã xác nhận cùng đích. Nếu UI có nhiều slot, thử thêm slot thứ hai trên bản sao fixture và kiểm tra slot cũ còn hay không.

**C — Storage sạch:**

Relaunch ở working directory mới, không phục hồi save; ghi menu/load/continue thực tế và exception. Không kết luận hành vi khi dữ liệu vắng mặt bằng tên mục. Kết quả C làm fixture sạch cho SCN-0001.

Crash/kill giữa lúc ghi, dữ liệu hỏng và cross-emulator migration là phép thử bổ sung trên **bản sao snapshot**, không phải tiêu chí chính hoặc lý do sửa save gốc. Không mặc định định dạng RMS dùng chung giữa các emulator.

**Tiêu chí đóng:** có round-trip A/B sau dừng tiến trình với bảng trường S0/S1/S2 và snapshot manifest; có C; xác định bước save/load thật, ghi lỗi nếu xảy ra. Nếu chưa tìm được cơ chế save, scenario bị chặn và milestone chưa hoàn thành; không suy ra “save không được hỗ trợ”.

## Thực nghiệm tiếp tục — cold load đã quan sát

**A — S0 cạnh giường:** session `M15-SCN-0001-P1M-R05`, đi startup/New Game/Ronin/Hestia+Ron/Skip từ RMS mới. Ảnh BED/Status nằm ở `M15-SCN-0003-P1M-R05`. W → Right ×5 tới System (Save/Help/Options/Quit) → Enter ở Save. `M15-SCN-0006-P1M-R05/06-select-Save.png` hiện **“Game saved”**; console ghi `write _k`, `close : 432`, `write _o`, `close : 22`. Đây là output game/emulator, chưa phải trace method RMS.

Đường thoát đã thử: Enter đóng thông báo → Down ×3 tới Quit → Enter → “Are You Sure?”. Enter ở dialog này không đóng trong ảnh; Q (`81`, raw mapper `-21`) đưa về main menu. W Exit → dialog → Q; ảnh về logo nhưng PID `69768` **vẫn sống**. Harness sau đó gửi SIGTERM, `stop.json` xác nhận dừng; copy storage chỉ sau `/proc` không còn tiến trình. Không mô tả thành JVM đã tự thoát qua UI. Không thử kill giữa lúc ghi.

Snapshot **BED-SAVE-001** giữ local; [manifest](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0001-P1M-R05/BED-SAVE-001-storage.json) có toàn bộ path/size/hash/config. Relaunch bản sao snapshot cùng JAR/profile ở PID mới **74133**, run `M15-SCN-0006-P1M-R05L`. Sau startup, Load Game **đã được chọn sẵn**. Lượt khám phá ban đầu đã bấm Down rồi Enter nên mở Options; các tên ảnh `03-Load-Game`/`04-load-selection` không mô tả đúng nội dung ảnh, được giữ nguyên và giải thích ở đây. W quay lại → Up chọn Load Game → Enter → Ronin → Enter; `08-loaded-gameplay.png` xác nhận trở về cạnh giường.

| Trường UI | S0 trước save | S1 sau cold load | Evidence/phạm vi |
| --- | --- | --- | --- |
| Nhân vật/chức danh | Ronin / Rookie Swordsman | Khớp | Status R05 `04-W-status`, R05L `09-loaded-Status` |
| LV / EXP / NEXT | 1 / 0 / 80 | Khớp | Cùng ảnh Status |
| HP / SP | 74/74 / 60/60 | Khớp | SP theo UI, không đổi tên thành MP |
| Tiền | 800 | Khớp | Cùng ảnh Status |
| Items | Empty | Khớp màn Items | R05 `01-tab-Right`, R05L `10-1-loaded-tab` |
| Trang bị đang xem | Dull two hands sword, Attacking 10, Refining 0/22 | Khớp màn Equipment | R05 `02-tab-Right`, R05L `10-2-loaded-tab`; chưa so mọi mục/slot |
| Vị trí/map | Cạnh giường trong nhà | Khớp điểm neo hình ảnh | BED R05 `02-bed`, R05L `08-loaded-gameplay`; chưa có tọa độ/map name theo UI |
| Ngôn ngữ UI | English | English | Không có thay đổi ngôn ngữ để kiểm persistence độc lập |
| RNG/toàn bộ state/giờ chơi | Chưa đo | Chưa đo | Không suy từ ảnh hoặc save hash |

**B — S2 vị trí khác:** từ S1, W đóng UI; Down giữ yêu cầu 1000 ms rồi release/nghỉ; Left 500 ms rồi release/nghỉ. R05L `12-S2-input-room.png` ở gian dưới bên trái bàn/ghế, khác cạnh giường. W → System → Save; `14-S2-saved.png` hiện “Game saved”. Dừng PID 74133 bằng SIGTERM sau thông báo lưu; snapshot [HOUSE-INPUT-001](fixtures/HOUSE-INPUT-001.md). Cold load snapshot ở PID **76026**, case `M15-SCN-0003-P1M-B-R01/04-restored-fixture.png`, khôi phục S2 thay vì S0. Các case input tiếp theo cũng dùng snapshot bất biến này. UI vẫn có mục Ronin; file record ở cùng đường đổi hash. Chưa suy ra schema hoặc nhiều slot chỉ từ file name/hash.

**C — RMS sạch:** R05 và R02/R03/R04 trước đó đã khởi động từ directory mới; menu có Load Game nhưng Down từ New Game bỏ qua tới Options. Không gọi đó là lỗi load/save. Đợt này không thử sửa/hỏng RMS.

**Kết luận có giới hạn:** đã thấy save qua UI và load đúng các trường/điểm neo nêu trên **sau khi JVM cũ đã dừng**, với cả S0 và S2. Mỗi trạng thái mới được save một chu kỳ; nhiều lần load cùng snapshot cho input không phải ba chu kỳ save/load độc lập. Trace RMS/flush/close, 3 chu kỳ A/B, mọi slot/trang bị và biến thể ngôn ngữ còn thiếu; chưa đạt toàn bộ SCN-0006. FPS/callback ordering vẫn chưa xác minh. Tone/MIDI là giới hạn backend emulator riêng, không quy lỗi save hoặc game gốc.
