# SCN-0002 — Menu và tải vào màn chơi

**Bản gốc:** chưa chạy, chưa xác minh. **Web:** chưa chạy. JAR/hash, P1, 3 lượt/biến thể, mapping theo [quy trình](J2ME-RUNTIME-PROTOCOL.md); dùng [mẫu run](RUN_TEMPLATE.md).

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
