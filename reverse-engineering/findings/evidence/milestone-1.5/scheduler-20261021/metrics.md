# Số liệu đo SCN-0004

Dẫn xuất từ log thật; n độc lập=3 mỗi nhóm, T=30 giây/lượt. Interval không nối qua biên run. Median/p95/max là ms; rate là median của 3 N/T; p95 nearest-rank. `—` là không có mẫu.

| Nhóm | Miền | N từng lượt | Rate median Hz | n interval | Median | p95 | Max |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| baseline/gameplay/hold | xdamage_receive | 419/419/420 | 13.967 | 1255 | 71.434 | 91.691 | 141.193 |
| baseline/gameplay/tap | xdamage_receive | 421/421/419 | 14.033 | 1258 | 71.296 | 93.320 | 137.911 |
| baseline/menu/tap | xdamage_receive | 593/594/595 | 19.800 | 1779 | 50.438 | 94.442 | 100.658 |
| trace/gameplay/hold | xdamage_receive | 419/418/418 | 13.933 | 1252 | 71.330 | 91.075 | 142.323 |
| trace/gameplay/hold | scheduler | 420/420/419 | 14.000 | 1256 | 71.354 | 72.235 | 98.633 |
| trace/gameplay/hold | repaint_request | 420/420/419 | 14.000 | 1256 | 71.355 | 72.231 | 98.653 |
| trace/gameplay/hold | paint | 420/420/419 | 14.000 | 1256 | 71.364 | 72.264 | 98.731 |
| trace/gameplay/hold | update | 420/420/419 | 14.000 | 1256 | 71.363 | 72.295 | 98.779 |
| trace/gameplay/hold | frontbuffer_flush | 420/420/419 | 14.000 | 1256 | 71.371 | 72.224 | 98.473 |
| trace/gameplay/hold | awt_paint_submission | 420/420/419 | 14.000 | 1256 | 71.353 | 72.286 | 98.714 |
| trace/gameplay/tap | xdamage_receive | 418/419/420 | 13.967 | 1254 | 71.350 | 93.365 | 141.811 |
| trace/gameplay/tap | scheduler | 419/420/420 | 14.000 | 1256 | 71.279 | 72.185 | 92.240 |
| trace/gameplay/tap | repaint_request | 419/420/420 | 14.000 | 1256 | 71.279 | 72.191 | 92.301 |
| trace/gameplay/tap | paint | 419/420/420 | 14.000 | 1256 | 71.277 | 72.208 | 92.403 |
| trace/gameplay/tap | update | 419/420/420 | 14.000 | 1256 | 71.281 | 72.220 | 92.411 |
| trace/gameplay/tap | frontbuffer_flush | 419/420/420 | 14.000 | 1256 | 71.287 | 72.175 | 91.158 |
| trace/gameplay/tap | awt_paint_submission | 419/420/420 | 14.000 | 1256 | 71.272 | 72.231 | 92.493 |
| trace/menu/tap | xdamage_receive | 593/595/593 | 19.767 | 1778 | 50.562 | 93.676 | 99.974 |
| trace/menu/tap | scheduler | 593/595/594 | 19.800 | 1779 | 50.603 | 51.181 | 59.990 |
| trace/menu/tap | repaint_request | 593/595/594 | 19.800 | 1779 | 50.605 | 51.204 | 59.981 |
| trace/menu/tap | paint | 593/595/594 | 19.800 | 1779 | 50.604 | 51.257 | 59.962 |
| trace/menu/tap | update | 0/0/0 | 0.000 | 0 | — | — | — |
| trace/menu/tap | frontbuffer_flush | 593/595/594 | 19.800 | 1779 | 50.600 | 51.179 | 59.756 |
| trace/menu/tap | awt_paint_submission | 593/595/594 | 19.800 | 1779 | 50.599 | 51.225 | 59.983 |

Duration **inclusive**, có chi phí probe; `ar.paint` gồm pacing. Chỉ tính span kết thúc trong cửa sổ.

| Nhóm trace | Miền | n duration | Median ms | p95 ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: |
| trace/gameplay/hold | update | 1259 | 0.032 | 0.148 | 2.676 |
| trace/gameplay/hold | world_render | 1259 | 0.463 | 1.163 | 4.724 |
| trace/gameplay/hold | hud_render | 1259 | 0.083 | 0.228 | 0.557 |
| trace/gameplay/hold | paint | 1256 | 70.955 | 71.863 | 72.342 |
| trace/gameplay/hold | pacing | 1256 | 70.171 | 71.197 | 71.793 |
| trace/gameplay/hold | before/after Thread.sleep | 0 | — | — | — |
| trace/gameplay/tap | update | 1259 | 0.023 | 0.072 | 1.040 |
| trace/gameplay/tap | world_render | 1259 | 0.462 | 1.130 | 2.242 |
| trace/gameplay/tap | hud_render | 1259 | 0.071 | 0.183 | 13.795 |
| trace/gameplay/tap | paint | 1256 | 70.935 | 71.854 | 73.696 |
| trace/gameplay/tap | pacing | 1256 | 70.177 | 71.193 | 72.272 |
| trace/gameplay/tap | before/after Thread.sleep | 0 | — | — | — |
| trace/menu/tap | update | 0 | — | — | — |
| trace/menu/tap | world_render | 0 | — | — | — |
| trace/menu/tap | hud_render | 0 | — | — | — |
| trace/menu/tap | paint | 1779 | 50.324 | 50.653 | 58.301 |
| trace/menu/tap | pacing | 1779 | 50.108 | 50.243 | 58.090 |
| trace/menu/tap | before/after Thread.sleep | 0 | — | — | — |

Overhead quan sát bên ngoài: XDamage và CPU JVM. Mỗi cặp là trace trừ baseline cùng repeat/case, chạy khác thời điểm; không suy causal overhead thuần hoặc internal cadence của baseline.

| Cửa sổ/case | Δ rate Hz median/p95 (n=3) | Δ interval median ms: median/p95 | Δ interval p95 ms: median/p95 | Δ CPU s: median/p95 |
| --- | --- | --- | --- | --- |
| menu/tap | 0.000/0.033 | 0.141/0.194 | -0.841/-0.103 | 0.230/0.250 |
| gameplay/tap | -0.067/0.033 | 0.053/0.141 | 0.662/1.199 | 0.100/0.210 |
| gameplay/hold | -0.033/0.000 | -0.041/-0.006 | -1.238/1.581 | 0.000/0.280 |

Chi tiết N/T, duration, state/thread, CPU theo run: [analysis.json](analysis.json), [aggregate.json](aggregate.json). P95 của 3 chênh lệch trial là max. Proxy host chịu coalescence và tải host; không coi Δ âm là probe làm game nhanh hơn.

| Case trace | n tap/hold | Hold bracket listener từng lượt (ms) | Callback press→release median/p95 ms | Press→m.i kế tiếp median/p95 ms | Release replay trong q.i |
| --- | ---: | --- | --- | --- | ---: |
| tap | 3 | 21.139–23.407; 21.232–22.797; 21.462–23.267 | 71.169/71.187 | 0.094/0.102 | 1 |
| hold | 3 | 1001.519–1003.470; 1001.093–1004.022; 1001.268–1003.364 | 1002.067/1004.076 | 0.125/0.128 | 0 |

Press→m.i chỉ là thời gian tới entry update kế tiếp, **không phải latency phản ứng gameplay hoặc frame hiển thị**. P95 input n=3 là max. Hold thực đọc từ listener bounds; callback game có thể xử lý cả press/release trong cùng batch sau khi cả hai đã được enqueue.
