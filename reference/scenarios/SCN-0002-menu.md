# SCN-0002 — Menu và tải vào màn chơi

**Bản gốc:** đã quan sát menu/New Game/Back/loading trong 3 lượt P1M có kiểm soát; **chưa đạt toàn bộ**. Load save, các biên menu và trace CF-02 còn thiếu. **Web:** chưa chạy. Kế hoạch ban đầu và biên bản thực nghiệm tách riêng bên dưới.

## Điều kiện và chuỗi thao tác

Từ đường startup đã ghi ở SCN-0001, lưu ảnh menu cùng fixture RMS. Tên menu/ngôn ngữ và vị trí mục chưa được quan sát; lần khám phá phải ghi lại để các lượt sau replay đúng input. Không gán tên menu cho state số.

1. Không input 2 giây, lưu ảnh mục đang chọn và trace state nếu có.
2. `tap(8,100)`, `wait(500)`; `tap(2,100)`, `wait(500)`. Chụp ảnh sau mỗi lần; ghi dịch chuyển lựa chọn, wrap/clamp nếu xuất hiện. Sau đó đi đến từng biên bằng số tap thực tế được ghi và thử thêm một tap để xác định biên.
3. Với mục có thể mở rồi quay lại, `tap(5,100)`, `wait(1000)`; lưu màn con. Dùng phím Back đã hiệu chuẩn, `tap(Back,100)`, `wait(1000)`; ghi mã thật và màn quay lại. Nếu UI chưa xác định Back, ghi bị chặn bước này.
4. Từ cùng fixture, chọn mục tạo phiên chơi mới bằng đường UI đã ghi; giữ nguyên chuỗi lựa chọn nhân vật/ngôn ngữ thực tế, không mặc định slot hoặc tên. Bắt đầu trace trước xác nhận, không input trong lúc tải, tối đa 60 giây; chụp loading và màn sau tải.
5. Biến thể B dùng fixture có save để thử mục tiếp tục/load nếu UI có. Ghi mục bị vô hiệu hóa hoặc không tồn tại như quan sát; chưa kết luận save hỏng từ một ảnh menu.

## Đối chiếu và evidence

CF-02 cần đường worker `bt.a()` → `bt.run()` mode `1`: sau load `/sgui/q…` thành công phải quan sát `j()`, `k()`, `m.b(BBBB)V`, `q.b:Z=true`. Chỉ thấy loading kết thúc không chứng minh các lời gọi này. Ghi enqueue/thread/state ở đầu và cuối tải, xem command kế tiếp thực sự được tiêu thụ ra sao.

Không tự gọi `bt` mode `1` là “new game” cho đến khi trace nối được thao tác UI với nhánh đó. Nếu mục vừa chọn không chạm nhánh, vẫn giữ run UI và ghi CF-02 chưa phủ; bổ sung tại SCN-0008.

**Tiêu chí đóng:** đường menu A/B có ảnh, input thực tế và fixture; chọn/quay lại/tải được quan sát 3 lần, có trace CF-02 hoặc đánh dấu điểm còn thiếu. So sánh kết quả với giả thuyết tĩnh ở [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md); khác biệt phải điều tra, không sửa web trong milestone này.

## Thực nghiệm 2026-10-21

Game hash/emulator release 1.52/commit/SHA-256 và P1M Motorola như [SCN-0001](SCN-0001-startup.md#thực-nghiệm-2026-10-21). Ba run **M15-SCN-0002-P1M-R02/R03/R04** kế thừa session startup có cùng hậu tố, được tạo độc lập từ RMS sạch. Ngôn ngữ UI: tiếng Anh; chưa có save gameplay. Input tổng hợp qua emulator KeyListener; không ép state, chưa chứng minh đường bàn phím vật lý hoặc callback game.

Chuỗi có kiểm soát của mỗi run; `tap` giữ dự kiến 100 ms, nghỉ 700 ms sau release rồi chụp ảnh, có overhead attach/capture không được tính là thời gian game:

| Bước | AWT key / thao tác | Kết quả trong ảnh native 240×320 |
| --- | --- | --- |
| 1–2 | Down `40`, Up `38` | Menu có New Game/Load Game/Options/Help/About/Exit. Từ New Game, Down tới Options; Up trở lại New Game trên dữ liệu sạch. Không suy thành quy tắc chung của mọi save |
| 3–4 | Enter `10`, W `87` | Mở màn Ronin; W quay về menu ở P1M. Raw mapper của W là `-22`; normalize `-22→-8` có cơ sở source/bytecode, chưa có trace trực tiếp callback |
| 5–7 | Enter ×3, từng bước có ảnh | Mở Ronin lại → thông báo GUARDIANS SELECTION → danh sách guardian |
| 8–10 | Enter, Right `39`, Enter | Chọn Hestia, chuyển sang Ron (Water attribute/Healer) và chọn guardian thứ hai; xuất hiện ARE YOU SURE? |
| 11–12 | Left `37`, Enter | Chọn Yes rồi xác nhận; ảnh có loading |
| 13 | Không input 10 giây sau chuỗi | Intro Roah/Ronin với lời thoại “Are you sure you want to quit your job?”; chưa đồng nghĩa đã điều khiển gameplay |

File `input.log` ghi thứ tự key down/up, thời gian monotonic, AWT code và mapping emulator tính lúc phát. Bộ ảnh `01-Down.png` … `13-after-load.png` lưu local tại `reference/screenshots/<run-id>/`. Chỉ số bước là số thao tác trong harness, không phải frame hoặc state game.

Lượt khám phá Standard có W/A không quay lại màn Ronin; P1M Motorola đã quay lại được. Lượt P1M-R01 có thao tác tay nên giữ riêng, không tính vào ba lượt có kiểm soát.

**Evidence:** mỗi run có launch.json liên kết session console/config/RMS, input.log, framebuffer.log, state-after-load.log và manifest; xem [runtime evidence](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md) và [FND-0003](../../reverse-engineering/findings/FND-0003-emulator-smoke.md).

**Chưa xác minh:** CF-02 phải có trace `bt.run`/BCI tới hậu xử lý; log `sleep`, `map : 0` và ảnh loading **không thay thế** trace đó. Chưa kiểm hết menu bounds/wrap, fixture có save hoặc load/continue. Chưa có timing/latency/FPS thực tế; chưa đánh dấu đạt toàn bộ.
