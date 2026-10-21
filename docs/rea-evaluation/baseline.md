# Baseline đánh giá REA

**Lần khảo sát:** 2026-10-21, Milestone 1. **JAR chuẩn:** `original/heroes-lore-v2.1.2.jar`, 554715 byte — **SHA-256:** `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`. Hash khớp `original/SHA256.txt`, `sha256sum`, Python `hashlib` và `REA.open_binary`.

**Kết quả:** REA MCP mở được JAR như ZIP và lập inventory. Chưa phân tích được Java/J2ME bytecode qua REA trong môi trường này. Nghiên cứu lifecycle/loop/input/state tiếp tục bằng source JADX có sẵn và `javap` trực tiếp, được ghi riêng tại [FND-0001](../../reverse-engineering/findings/FND-0001-game-loop.md) và [game overview](../architecture/game-overview.md).

## Môi trường và catalog thực tế

`binary_session({})` trả server/package **`rea-agents` 6.7.0**, skill expected version `42`, host Linux; client `codex-mcp-client` 0.163.0, protocol `2025-06-18`. Session ban đầu đóng, không có target cũ để tái sử dụng. Tool catalog công bố **207 MCP tools**, khớp 207 tên REA được client cung cấp. Catalog digest `tools_sha256`: `af39310c9591bb981893ec0d2188b1bcf6e9cc8ba3ac513d5bbefc8ddcb85639`.

Sau khi mở JAR, `analysis_provider_binding=null`. Mở rộng các group trong `tool_availability`: 97 tên có nhãn `available`, 55 `target_unsupported`, 26 `provider_unavailable`, 20 `provider_missing`, 9 `unsupported_host`. Đây là **metadata của catalog tại thời điểm khảo sát**, không phải 97 tools đã test thành công. Toàn bộ tên/group/reason nằm trong [rea-probes.json](../../reverse-engineering/findings/evidence/milestone-1/rea-probes.json); không suy ra khả năng J2ME từ các tool có nhãn available nhưng phục vụ định dạng khác.

| Route / provider | Trạng thái được xác minh | Ý nghĩa đối với JAR này |
| --- | --- | --- |
| `open_binary`, `rea-artifact-graph` | Probe thành công; `format=zip`, `kind=archive`, `architecture=null`; `inspect_artifact` thành công | Hỗ trợ identity/inventory archive, chưa phải Java analysis |
| JEB integration (`inspect_jeb_client`, `open_jeb_project`, `list_jeb_units`, `decompile_jeb_item`) | Có trong tool catalog; session báo `provider_missing`, `JEB MCP catalog failed`; hai probe JEB trả `capability_unavailable`, reason `fetch failed` | Không kết nối được JEB MCP nên chưa kiểm tra import/decompile J2ME qua JEB |
| Android/JADX provider | Session yêu cầu `REA_JADX_MCP_JAR` trỏ tới `jadx-headless-mcp 0.7.1` do operator cung cấp; hiện thiếu | Cài sẵn JADX CLI không chứng minh REA JADX MCP khả dụng |
| `inspect_android_package` trên JAR | Probe bị từ chối: `Target ... is zip; provide one standalone APK.` | Route được công bố này yêu cầu APK; không chấp nhận J2ME JAR hiện tại |
| Ghidra deep provider | `unavailable/not_configured`: thiếu `GHIDRA_INSTALL_DIR` | Session báo archive target không được hỗ trợ bởi adapter hiện tại; không phải kết luận về mọi khả năng của Ghidra độc lập |
| Hopper deep provider | `unavailable/executable_missing`: `/opt/hopper/bin/Hopper` | Session báo không trực tiếp phân tích archive |
| IDA deep provider | `unavailable/not_configured`: thiếu `REA_IDA_MCP_CONFIG` | Session báo `target_kind_unsupported` cho archive |
| Kuna deep provider | `unavailable/not_configured`: thiếu `REA_KUNA_COMMAND` | Session báo không decompile database/archive |
| Managed static (`rea-dotnet-static`) | Catalog có capability PE/CLI | Đây là route .NET, không phải JVM/J2ME; không thử dùng sai định dạng |

JEB là integration với MCP client đang chạy, không nằm trong bốn `analysis_provider_candidates` của deep native binding ở session này. Không đồng nhất việc tool JEB được quảng bá với backend JEB hoạt động. Lỗi trả remediation endpoint mặc định `http://127.0.0.1:8425/mcp` hoặc `REA_JEB_MCP_URL`; không có phiên bản/client identity JEB thành công để báo cáo. Không khởi chạy/cài/configure JEB trong nhiệm vụ này.

## Probe thực tế và evidence

Các call sau dùng **REA MCP**, không phải REA CLI. Input path tuyệt đối: `/home/locdt/heroes-lore-web/original/heroes-lore-v2.1.2.jar`.

| Call | Kết quả và giới hạn |
| --- | --- |
| `binary_session({})` trước mở | Ghi nhận catalog/provider readiness; chưa có active target |
| `inspect_jeb_client({})` | Lỗi `capability_unavailable/unsupported_provider`, `fetch failed`; chưa nhận được catalog JEB |
| `open_binary({path})` | Thành công; ZIP archive và SHA-256 đúng |
| `inspect_artifact({detail:"summary"})` | Thành công; summary liên kết complete retained Evidence |
| `open_jeb_project({path})` | Lỗi `capability_unavailable/unsupported_provider`, `fetch failed`; thất bại ở kết nối provider, chưa xác định JAR có được JEB nhận hay không |
| `inspect_android_package({path,detail:"summary"})` | Lỗi định dạng target: yêu cầu một standalone APK; không phải kết quả decompile |
| `binary_session({})` sau mở | Archive target, không có deep provider binding; availability như bảng trên |
| `export_evidence_bundle({path})` | Export 3 records, 1826084 byte, 0 residual-unknown records; số 0 này không có nghĩa nghiên cứu hết unknowns |
| `close_binary({})` | Thành công, `result=null`; đã đóng target |

Lần export đầu trả `invalid_request` vì directory output chưa tồn tại; sau khi tạo directory local thì export thành công. Không lặp lại probe JEB khi blocker không đổi. Không cài thêm provider, dependency hoặc đổi cấu hình.

Log payload và lỗi: [rea-probes.json](../../reverse-engineering/findings/evidence/milestone-1/rea-probes.json). Bundle Evidence: [rea-evidence-bundle.json](../../reverse-engineering/findings/evidence/milestone-1/rea-evidence-bundle.json).

Inventory REA có Evidence `ev_2b2d621e1d3e9b798c02223f09e2b01eef6f2515d7c7bcdcae9a2ba60dc242c8`; inspection `ev_c9012956b190fbc3e6046d525bec51a96112d83a9f3708a55cd6aae01cb08276`; summary `ev_e15ff1be198582797cae5b46c63da01b110c60219872a9baf7b331fba1549f21`. Graph manifest `agm_6ba713d1c1c48f6571b0e524d05956df7963dc38f18b62ac5965014365a4520e` báo 818 nodes, 827 occurrences, 826 edges; entry kinds gồm 799 files, 28 directories; 0 integrity contradictions được báo trong phạm vi inventory. Nodes có thể biểu diễn nội dung dùng chung, nên không đồng nhất node count với file count.

Giới hạn tool trả về: inventory ZIP chỉ đọc central-directory entries; không bao phủ non-entry bytes, không thực thi target, không xác nhận format-specific semantics/runtime behavior. `source_complete=true` là completeness của inventory này, không phải coverage của kiến trúc hay mechanics. Con số **89 `.class`** và nội dung manifest MIDlet trong báo cáo đến từ Python `zipfile` độc lập ([local-evidence.json](../../reverse-engineering/findings/evidence/milestone-1/local-evidence.json)), không quy cho REA.

## Kết luận khả năng hỗ trợ J2ME

**Bằng chứng:** JAR được nhận trực tiếp dưới dạng archive và inventory thành công; native adapters hiện tại không nhận archive làm executable; Android route từ chối JAR; JEB endpoint chưa khả dụng.

**Kết luận có giới hạn:** trong REA 6.7.0 và cấu hình session này, chưa có route hoạt động để phân tích Java/J2ME bytecode của JAR. Không kết luận “REA không đọc được JAR” vì archive route đã thành công. Cũng chưa đủ bằng chứng để khẳng định JEB độc lập hoặc REA qua một JEB client được cấu hình đúng sẽ hỗ trợ/không hỗ trợ J2ME JAR này. Không có provider được cài thêm để mở rộng phép thử.

**Fallback đã thực hiện:** đọc source JADX có sẵn, đối chiếu trực tiếp bảy class bằng `javap 21.0.12.1`. Phát hiện lifecycle/Canvas/scheduler/update/input/state và bốn sai lệch JADX là kết quả các công cụ độc lập đó, không phải REA. Không dùng kết quả fallback làm evidence cho năng lực decompile/call graph J2ME của REA.

## Phân loại bằng chứng

| Nguồn | Vai trò | Tính là REA? |
| --- | --- | --- |
| REA + provider tương thích | Điều tra bằng MCP / CLI; lưu transcript và evidence | Có, nếu có log gọi tool |
| JADX | Decompile Java class | Không |
| JEB độc lập | Decompile / inspect | Không |
| REA qua JEB MCP | Điều tra bằng REA + JEB provider | Có, cần log xác minh |
| Emulator J2ME | Quan sát hành vi bản gốc | Không |
| Phaser / Vitest | Triển khai và kiểm thử bản web | Không |

## Thước đo sau khi triển khai

- **Coverage:** các cơ chế có evidence / tổng cơ chế kiểm kê.
- **Accuracy:** kết luận RE khớp quan sát thực tế.
- **Fidelity:** scenario đạt / tổng scenario chạy trên cả hai bản.
- **Traceability:** tỷ lệ implementation có liên kết evidence.
- **REA effectiveness:** bằng chứng REA thực sự cung cấp, lỗi/hạn chế, so sánh với phương án không dùng REA.

Không gộp hiệu quả của JADX hoặc JEB độc lập vào REA.

**Theo dõi M1.5, 2026-10-21:** kiểm tra lại bằng `javap` độc lập và chuẩn bị [scenario runtime](../../reference/scenarios/README.md), chi tiết [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). Không gọi lại REA/provider trong M1.5 nên không cập nhật readiness hoặc phạm vi năng lực từ kết quả cũ. Chưa launch emulator, 0/8 scenario đã chạy; chưa có bằng chứng runtime mới và chưa hoàn thành milestone. Kết quả preflight local không phải kết quả REA.

**Lượt tiếp tục:** [FND-0003](../../reverse-engineering/findings/FND-0003-emulator-smoke.md) có kết quả FreeJ2ME-Plus/WSLg cho 3 scenario quan sát một phần, chưa đạt toàn bộ. Version/hash/commit emulator, ảnh/log/config/input là bằng chứng emulator/local, **không phải đóng góp REA**. Chưa đo fidelity, accuracy hoặc FPS; chưa chạy đối chiếu web và chưa hoàn thành milestone. Đoạn preflight ở trên là lịch sử lượt chuẩn bị.

**Baseline hiện tại:** REA effectiveness xác minh được identity + archive inventory và chẩn đoán blocker provider/target; chưa cung cấp Java call graph/decompilation. Chưa đo coverage mechanics, accuracy runtime, fidelity, traceability implementation hay thời gian/tốc độ so với workflow khác. Chưa có scenario chạy trên bản gốc và web; không báo phần trăm hoặc tuyên bố hành vi đã tái tạo.
