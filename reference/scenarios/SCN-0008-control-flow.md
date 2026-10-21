# SCN-0008 — Phủ runtime 4 sai lệch JADX/javap

**Bản gốc:** chưa chạy; cả CF-01…04 chưa xác minh runtime. **Web:** chưa chạy. JAR/hash, P1 và trace theo [quy trình](J2ME-RUNTIME-PROTOCOL.md). Đây là test plan dựa trên `javap`, không phải kết quả emulator.

Các đường bytecode và ảnh hưởng port được kiểm lại trong [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). **BCI là offset trong method**, không phải byte offset trong JAR; descriptor và field type bắt buộc khi chọn điểm hook.

| ID | Điều kiện/đường tạo tự nhiên cần ghi | Điểm trace/breakpoint phân biệt | Bằng chứng đủ cho nhánh |
| --- | --- | --- | --- |
| CF-01 | Startup SCN-0001, `bf.a:B=0,b:B=1`, hai resource load thành công | `bf.run()V` BCI `92→96`, call `cd.y` tại `96`, `cd.A` tại `99`, `bf.b` tại `208`, `q.k` tại `211` | Cùng invocation/thread đi từ success goto tới đoạn nối; log không có exception ở vùng load. Chỉ thấy menu không đủ |
| CF-02 | Đường UI SCN-0002 thực sự tạo worker mode `bt.a:B=1`; load `/sgui/q…` thành công | `bt.run()V` BCI `146→150`, `j` tại `151`, `k` tại `155`, `m.b(BBBB)V` tại `168`, store `q.b:Z` tại `172` | Cùng worker invocation chạy hậu xử lý trên đường thành công, không nhầm mode `2/3/5` |
| CF-03 | Trong SCN-0004, `ar.paint` gọi `m.e()` với pending `m.b:B=0` | `m.e()V` BCI `0`, `3`, return `6`; slot store nằm tại `12` | BCI trace cho invocation return ở `6` không qua `12`. Entry/exit hoặc không thấy worker không đủ phân biệt |
| CF-04 | Từ đường UI đã ghi đưa tới pending command `21`, param `m.c:B=2`, rồi `m.e()` tiêu thụ | `m.e()V` BCI `439 m.c`, `446 ah.a(Z)`, `450 a(I)`, `453 bt.d`, return `456`; đường khác bắt đầu `457`, `464 br.f`, `467 bt.a` | Invocation param `2` kết thúc ở `456`, không qua `464/467`; worker `bt.d` đặt mode `5`. Không dùng sự vắng mặt của log thiếu coverage làm bằng chứng |

## Thao tác và phạm vi

1. Chạy SCN-0001/0002 với trace; chọn run/seq/BCI tương ứng CF-01/02, lưu cả input và fixture để lặp lại 3 lần. Đường exception là bổ sung: chỉ đánh dấu phủ nếu bắt được; fault injection ở bản sao phải ghi rõ.
2. Thu CF-03 từ một cửa sổ không pending và một invocation pending khác 0 để kiểm tra probe không bỏ mất toàn bộ đường dispatch. Muốn breakpoint: dừng tại entry, đọc slot rồi step tới return; lượt đó chỉ kiểm nhánh, không dùng timing.
3. CF-04: source JADX `ar.keyPressed` state `14` có đường `gameAction=8` hoặc raw `53` gửi `(21,2)`; `ar` còn call site khác. Đây là **định hướng tĩnh**, chưa biết đường UI tự nhiên đưa tới state `14` hoặc nhãn màn đó. Trước hết ghi chuỗi UI chạm state rồi `tap(5,100)`, đợi trace tiêu thụ pending; nếu chưa tới được thì CF-04 chưa xác minh.
4. Nếu phải gọi thẳng setter command hoặc ép state bằng debugger, tách run **injection**. Phép thử đó chỉ kiểm nhánh thực thi được, chưa chứng minh reachability từ UI; bổ sung run tự nhiên trước khi đóng câu hỏi hành vi.
5. Chạy CF-04 param `0/1` nếu tới được qua UI để kiểm đường đối chứng `457–467`; không dùng state/param số làm tên hành động gameplay. Biến thể đối chứng không thay thế param `2` bắt buộc.

**Tiêu chí đóng:** mỗi CF có ít nhất 3 lượt chạm nhánh tự nhiên, cùng JAR identity và trace chỉ rõ đường thành công/return; video/ảnh liên kết với input và trace. Breakpoint/step có thể chứng minh control flow nhưng không cadence. Khi probe không hỗ trợ BCI, ghi giới hạn và dùng debugger step có log; không điền “đạt” bằng suy luận từ `javap`.

Hiện chưa có run ID, trace hoặc screenshot cho bất kỳ CF nào. Không có kết luận runtime hoặc sửa đổi gameplay phát sinh từ scenario này.
