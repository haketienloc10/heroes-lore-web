# FND-0003 — Thực nghiệm FreeJ2ME-Plus trên WSLg

**Ngày:** 2026-10-21. **Phạm vi:** tiếp tục M1.5, SCN-0001/0002/0005. **Trạng thái:** đã chạy game và quan sát một phần; **chưa đánh dấu scenario đạt toàn bộ, milestone chưa hoàn thành**. Không sửa JAR gốc hoặc `web/`.

## Danh tính emulator và game

| Thành phần | Giá trị đã kiểm tra | Bằng chứng |
| --- | --- | --- |
| Game | 554715 byte; SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61` | Hash local trước chạy trong environment; kiểm tra lại sau thử nghiệm |
| Emulator chạy thực tế | `/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar`, 1161902 byte | Có sẵn trên máy; không tải/cài lại hoặc rebuild |
| SHA-256 emulator JAR | `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e` | Hash local, khớp member `freej2me.jar` trong archive |
| Release | FreeJ2ME-Plus **1.52**, tag `1.52` | [Release upstream](https://github.com/TASEmulators/freej2me-plus/releases/tag/1.52); metadata API ghi lại trong environment |
| Commit của tag | `8f87bf1497e7a9738a32d1909379376a1faca7dd` | Git local và [GitHub API tag](evidence/milestone-1.5/runtime-20261021/upstream-tag.json) khớp |
| Archive đã có | `freej2me-v1.52.zip`, 1923469 byte; SHA-256 `27eb4f51d4201b6f7682ed0259d08d86e0410d41f572412812fe1ae928df9688` | Khớp digest asset do API upstream công bố; không chỉ suy từ tên file |
| Checkout source riêng | HEAD `3933e75ef927a95eab9f5e065f0b76dabf336069` | **Khác commit release**, không phải binary đang chạy; dùng source tại tag `1.52` khi giải thích mapping/launch |
| Metadata trong JAR | `build.version=1.0.0`, `build.buildNum=0`, manifest `Implementation-Title: FreeJ2ME`, Created-By Temurin 8 | Không dùng các trường này để suy thành emulator release 1.0.0 hoặc JVM chạy hiện tại |

Danh tính release được nối bằng digest archive → hash member JAR → JAR đang launch, còn commit là commit của tag phát hành. Không có reproducible build để chứng minh binary tái biên dịch bit-for-bit từ source. Chi tiết: [environment.json](evidence/milestone-1.5/runtime-20261021/environment.json).

## WSL GUI và cấu hình hiệu lực

WSL2 Linux x86_64, WSLg có X11 `DISPLAY=:0`, socket `/tmp/.X11-unix/X0`. `xwininfo`/`xdpyinfo` thành công; process có AWT-XAWT và AWT event thread; lấy được ảnh cửa sổ chứa game, log MIDlet và ảnh framebuffer. Đây là bằng chứng GUI/J2ME chạy thực tế, vượt mức chỉ kiểm tra biến DISPLAY.

**JVM chạy:** OpenJDK `21.0.12.1`, không phải Temurin 8 ghi trong manifest build emulator. Manifest game yêu cầu MIDP-2.0/CLDC-1.0; emulator property thực đo là **MIDP-2.0/CLDC-1.1**, encoding `ISO_8859_1`, `microedition.locale=en-US`; game chọn ngôn ngữ hiển thị tiếng Anh. Không khẳng định profile emulator trùng một điện thoại gốc.

Lệnh chạy hiệu lực của **P1M** (từ working directory mới cho mỗi session):

```bash
java -Dfile.encoding=ISO_8859_1 -Dsun.java2d.uiScale=1 \
  -jar /home/locdt/tools/freej2me-plus-v1.52/freej2me.jar \
  file:///home/locdt/heroes-lore-web/original/heroes-lore-v2.1.2.jar \
  0 240 320 2 2 60
```

P1M: portrait 240×320, Motorola (layout CLI `2` của **1.52**), rotate `0`, scale yêu cầu `2`, sound `on`, fast-forward `false`, paused `false`, limiter `60`. Native framebuffer đúng **240×320**; snapshot `q.g/h` và `Mobile.lcdWidth/lcdHeight` cũng khớp. Kích thước cửa sổ host có thể bị compositor thay đổi; có log geometry từng lượt, không dùng kích thước cửa sổ để suy LCD.

**Phân biệt config lưu và config RAM:** file `game.conf` ban đầu còn `phone:Standard`, `fps:0`, trong khi snapshot sau CLI cho `phone=Motorola`, `fps=60`, `limitFPS=60`. Bản 1.52 còn tạo key `width=0,height=240` do đoạn parse thứ hai dùng sai index; kích thước có hiệu lực lấy từ `scrwidth=240,scrheight=320` và số đo nêu trên. Không sửa emulator để che khác biệt này. Giữ cả file config và snapshot RAM làm evidence.

**Limiter 60 không phải FPS thực tế.** Chưa đo cadence, input latency, overhead hay callback ordering; không dùng ảnh rời hoặc thread dump để báo FPS.

## Phát input và thu ảnh

Các lượt khám phá P1 Standard và P1M-R01 có cả thao tác tay và tự động. Người dùng xác nhận đang điều khiển tay; phím AWT Enter ngoài harness tại `14:55:13Z` được lưu trong probe. Các lượt này chỉ là khám phá, không tính thành lặp có kiểm soát. Sau đó người dùng chọn agent chạy tự động từ lượt mới và không bấm phím.

Input có kiểm soát dùng sidecar agent gọi **KeyListener của LCD emulator trên AWT EventQueue**; vẫn đi qua mapper/handler emulator, không gọi setter command, không ép state, không sửa class hoặc JAR game. Nó **bypass OS focus**, vì vậy không chứng minh đường bàn phím vật lý/X11, auto-repeat host hoặc latency vật lý. `computed_emulator_mapping` là kết quả hàm mapping emulator ở thời điểm đó, **không phải trace entry của `ar.keyPressed`**. Các snapshot field đọc độc lập, không nguyên tử.

| Host AWT / tên | Raw do mapper emulator tính ở P1M | Bằng chứng UI hoặc giới hạn |
| --- | --- | --- |
| `38` Up | `-1` | Lên menu/di chuyển |
| `40` Down | `-6` | Xuống menu/di chuyển |
| `37` Left | `-2` | Chọn Yes/di chuyển |
| `39` Right | `-4` | Chọn guardian/di chuyển |
| `10` Enter | `-20` | Xác nhận UI; không mặc định là raw `53` |
| `87` W | `-22` | Quay lại menu, Skip intro, mở/đóng Status; source/bytecode `ar` có normalize `-22→-8` |

Ở P1 Standard, W/A không làm quay lại màn Ronin trong ảnh đã thu. Source tag cho W raw `-7`, CLR raw `8`; chưa có callback trace chứng minh toàn bộ đường đó. Hàng số trên bàn phím cũng chưa hiệu chuẩn; config 1.52 dùng keycode numpad, nên bảng KEYMAP trên nhánh devel không đủ để cam kết hàng số hoạt động ở build này.

Ảnh **XGetImage** là ảnh drawable X11 của cửa sổ; AWT Robot ở môi trường này trả ảnh đen kèm lỗi ScreencastHelper nên các ảnh Robot bị loại khỏi bằng chứng hành vi. Một số ảnh X11 và framebuffer lấy ở các mốc khác nhau khác nội dung; không dùng chúng làm thời điểm present hoặc kết luận nội bộ chỉ từ ảnh cửa sổ. Ảnh **frontbuffer** được lấy qua cùng getter mà `ScreenShot` của emulator dùng, không phải ảnh compositor hoặc màn hình điện thoại thật. Cách lấy ảnh không khóa cùng game paint; không đo timing từ nó.

Probe và runner: [harness.json](evidence/milestone-1.5/runtime-20261021/harness.json), [scripts](../scripts/). Các probe không transform class; Java 21 có warning dynamic agent loading, được giữ nguyên trong console. Không gộp warning này với exception của game.

## Kết quả thực nghiệm trọng tâm

Các session có kiểm soát: **P1M-R02/R03/R04**, cùng JAR và RMS sạch, đều hoàn tất chuỗi startup/menu vào intro. Gameplay R02/R03 lặp chuỗi trong nhà; R04 dùng biến thể cửa ra theo hướng dẫn người dùng. Không mô tả thành ba lần lặp cùng toàn bộ gameplay. Lượt Standard và P1M-R01 có input hỗn hợp, giữ làm chẩn đoán riêng. Log, config, ảnh và hash: [runtime evidence](evidence/milestone-1.5/runtime-20261021/README.md).

| Scenario | Điều đã quan sát | Điều chưa được xác minh |
| --- | --- | --- |
| SCN-0001 | MIDlet `rpg.GameMIDlet` được tạo; Canvas log 240×320; logo ở checkpoint 10 giây, sau Enter vào menu; snapshot controller hiện tại từ `bf` sang `ar` | Thứ tự chính xác constructor/paint/clip; CF-01 theo BCI; startup với save fixture; không có thời gian startup chính xác |
| SCN-0002 | Menu New Game/Load Game/Options/Help/About/Exit; Down từ New Game tới Options ở dữ liệu sạch, Up trở lại; mở Ronin, W quay về; chọn Ronin, Hestia và Ron, Yes; loading rồi intro Roah/Ronin | Chưa xác minh load save; chưa phủ hết biên menu; CF-02 chưa có method/BCI trace |
| SCN-0005 | Skip intro → căn nhà và HUD; snapshot `m.e:int=2`; di chuyển bốn hướng, giữ/thả phím; hai lần Right tại mép phải cho vị trí hiển thị không tiến qua mép trong ảnh; W mở/đóng Status. R04 từ giường Down 1 giây hai lần có release/nghỉ giữa đã ra đường phố qua cửa giữa dưới, console map `64→0`; state sau cửa vẫn `2` | Không suy collision formula/hitbox/tốc độ; Enter có được phát nhưng chưa đủ ảnh diễn tiến để xác nhận combat; hai lần thử gần NPC ngoài phố chưa có hội thoại mới; chưa có fixture restore độc lập và chưa đủ 3 lượt mỗi biến thể gameplay |

Status đã đọc được: Ronin, Rookie Swordsman, LV 1, EXP 0, NEXT 80, HP 74/74, SP 60/60, tiền 800. Đây là mẫu trạng thái của lượt chơi mới đã quan sát, không phải đặc tả mọi nhân vật/save. Tên map trong nhà chưa được UI xác nhận; không đặt tên chỉ từ hình ảnh.

## Lỗi, nguyên nhân và mức ảnh hưởng

| Hiện tượng | Bằng chứng/giải thích có giới hạn | Xử lý và trạng thái |
| --- | --- | --- |
| Launch mặc định UTF-8 tự restart | Console R01 báo encoding UTF-8 khác ISO_8859_1; thấy process con. Source tag cho `checkFileEncoding/restartApp` | Lượt đầu mất chuỗi console đầy đủ và tham số profile sau restart không được giữ đầy đủ; lượt mới truyền `-Dfile.encoding=ISO_8859_1` ngay từ launch, không còn restart này |
| Tone/MIDI không mở được | `Couldn't open Tone Player: Can not open line`; có lỗi prefetch vì `synthesizer` null | Game vẫn tới menu/gameplay. Lỗi backend Java Sound theo log; nguyên nhân thiết bị/driver sâu hơn chưa xác minh. Sound `on` không chứng minh audio phát được |
| `RecordStoreNotFoundException` với `_c` ở RMS sạch | Stack qua `at`, `br.i`, `bv.d`; sau đó log kiểm tra vắng dữ liệu và `write _c`, `close : 6` | Trong các lượt này không làm dừng game. Không coi exception được log là crash, cũng không suy ra save gameplay đã đúng |
| Robot chụp đen | `Could not load native libraries for ScreencastHelper`; file PNG đen | Loại khỏi kết luận UI; dùng XGetImage và framebuffer có nguồn rõ |
| Input OS khó đối chiếu ở lượt khám phá | XTest/Robot/XSendEvent không có tương quan AWT/MIDlet đáng tin cậy, lại có thao tác tay | Không gán ảnh đổi màn cho một input OS cụ thể. Lượt mới dùng input tổng hợp có log, tách giới hạn về bàn phím vật lý |
| Back trên Standard chưa hoạt động ở màn thử | Ảnh trước/sau W và A; mapper/source Standard không khớp raw `-8` mà game dùng | Dùng profile Motorola riêng P1M và lưu cấu hình/mapping; không sửa game hoặc coi đó là bug của bản gốc |

Không quan sát thấy fatal exception ngăn vào gameplay ở các lượt có kiểm soát đã nêu. Điều này không chứng minh toàn bộ JAR tương thích hoặc không còn lỗi khác.

## Provenance và điều kiện còn lại

Kết quả trên do **emulator + GUI/sidecar local**, không phải REA. REA vẫn chỉ có identity/inventory từ M1; JADX/`javap` giải thích nhánh và mapping game tĩnh, không biến thành runtime trace. Thay đổi trạng thái được snapshot ở các mốc không chứng minh thứ tự callback/BCI.

Chưa đánh dấu đạt toàn bộ SCN-0001/0002/0005. Cần hoàn tất biến thể/fixture của từng scenario, trace các nhánh CF, đường input vật lý nếu muốn kết luận về bàn phím, dữ liệu timing có sai số/overhead, save/load sau dừng tiến trình và các scenario còn lại. Xem [checklist milestone](../../reference/scenarios/README.md). Kết quả web: chưa chạy; không có thay đổi gameplay web.
