# Water Sort Level Lab

Chia sẻ bộ này cho người không cài Unity để tạo level bằng AI và chơi thử đúng game trên localhost.

## Đồng nghiệp: bắt đầu

1. Giải nén **toàn bộ** thư mục được chia sẻ. Cài Node.js 22 hoặc mới hơn nếu chưa có.
2. Khởi động Lab:
   - **Windows:** mở `Start.cmd`
   - **macOS / Linux:** trong Terminal tại thư mục Lab chạy:
     ```sh
     chmod +x Start.sh   # lần đầu nếu cần
     ./Start.sh
     ```
     Hoặc: `node Tools/LevelLab/server.js`
3. Server tự chọn cổng trống (mặc định từ 8081) và mở trình duyệt. Giữ terminal mở trong lúc chơi.
4. Chọn pack và bấm **Chơi pack này**. Game mở ở tab mới.

Không cần Unity, Python, npm install hay tài khoản dịch vụ AI riêng. AI là công cụ coding bạn đang dùng, có thể đọc/ghi thư mục và chạy Node.

## Sửa config (không cần Unity)

File config nằm trong bộ Lab:

`Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`

Đây là YAML text. Đồng nghiệp sửa bằng editor hoặc nhờ AI — **không mở Unity**. Schema các trường nằm cạnh đó:

`Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`

**Cách làm thường dùng (AI):**

> Đọc AGENTS.md và `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`. Đặt `levelsPerPack` thành 5, chọn profile Easy, giữ nguyên rule capacity/layout/Ad. Sau đó chạy `node Tools/LevelLab/generate.js` và báo pack vừa tạo.

**Tự sửa tay:** mở file `.asset` → đổi các số/cờ cần thiết → lưu → chạy generate. Giữ nguyên các dòng header `%YAML` / `MonoBehaviour:` / `m_*`.

Gợi ý khi thử:

| Mục tiêu | Trường thường đụng |
|---|---|
| Pack nhỏ để test nhanh | `levelsPerPack: 3` … `10` |
| Độ khó | `selectedDifficultyProfile: Easy\|Normal\|Hard\|VeryHard\|Special` hoặc `--profile` |
| Ít/nhiều màu, ẩn, khóa, Mega | trong `difficultyProfiles` của profile đang bật |

Sau khi đổi config:

```sh
node Tools/LevelLab/generate.js
```

Generate luôn **pin** bản config lúc chạy vào `GenerationRuns/pack-###-config.asset`. Sửa config giữa chừng không làm hỏng run đang chạy; lần generate sau mới dùng bản mới. Đổi palette màu thì cần player mới từ chủ project — đổi config sinh level thì không.

## Tạo level bằng AI

Mở thư mục gốc trong công cụ AI, gửi:

> Đọc AGENTS.md và agent-rules/watersort-level-generation.md. Nếu cần, sửa `WaterSortGenerationConfig.asset` theo yêu cầu của tôi trước. Tạo một pack mới bằng Tools/LevelLab/generate.js. Kiểm tra solution, không ghi đè pack cũ. Cho tôi biết pack nào để chơi thử.

Hoặc tự chạy:

```sh
node Tools/LevelLab/generate.js
node Tools/LevelLab/generate.js --profile Easy --seed 12345
```

Lệnh đầu dùng config hiện tại, tự chọn số pack trống và ghi seed vào `GenerationRuns/pack-###.json`. `--pack 5` chọn số pack; nếu đã tồn tại thì từ chối ghi đè. `--config path/to/config.asset` dùng một bản config khác (ví dụ bản copy để thử nghiệm). Lệnh không nhận câu tự nhiên; AI chuyển yêu cầu thành chỉnh config hoặc các tham số được hỗ trợ.

Một số cấu hình khó có thể chạy nhiều phút hoặc bị generator từ chối; đọc lỗi rồi điều chỉnh config/yêu cầu, không hạ rule ngầm.

Sau khi tạo thành công: quay lại Level Lab → **Tải lại danh sách** → chọn pack → mở game. Nếu sửa data của pack đang chơi, tải lại trang game để bắt đầu từ trạng thái mới. Không cần build lại. Đổi code gameplay hoặc palette màu cần bản player mới từ người phụ trách project; config sinh level và JSON không cần rebuild.

## Data và gửi lại project

- Level: `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- Solution: `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`
- Nhật ký seed và bản config dùng lúc sinh: `GenerationRuns/`.

Gửi cả hai JSON tương ứng và nhật ký/config cho người phụ trách. Nếu nhiều người tạo trùng số pack, người nhận chọn tên pack mới cho **cả cặp**; giữ quan hệ `level.id` với `solution.levelNumber` trong pack. Không ghép solution theo thứ tự toàn bộ thư mục.

Server chỉ cho chơi các cặp vượt qua validator production. Lỗi hiện trên trang Level Lab. Sửa level thủ công làm solution cũ mất hiệu lực: phải tạo lại solution đúng rule rồi kiểm tra lại; không thay mỗi level để che lỗi. Không cần chạy solver tổng quát sau mỗi lần generate: wrapper đã replay solution bằng validator.

```sh
node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-001.json Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-001.json
```

Nếu cần chỉ định cổng/player: `node Tools/LevelLab/server.js 8090 Builds/WebGL`. Nếu tiến trình generate bị tắt cưỡng bức và để lại `.level-lab-generation.lock`, chỉ xóa file lock sau khi chắc chắn không còn lệnh generate nào chạy trong thư mục đó.

## Chủ project: build và đóng gói một lần

Các lệnh sau chỉ dành cho project Unity gốc. Đồng nghiệp dùng bản đóng gói không cần chạy chúng.

1. Trong Unity: **Tools → Water Sort → Build → WebGL Release Build**. Build kiểm tra catalog trước khi chạy và tạo marker sau khi thành công. Nếu Editor đã đóng, có thể dùng `powershell -ExecutionPolicy Bypass -File Tools/Build-WebGL.ps1 -Release`.
2. Chạy:

```sh
node Tools/LevelLab/package.js Builds/WebGL Builds/LevelLab
```

3. Nén và gửi thư mục `Builds/LevelLab`. Bao gồm `Player/`, `Tools/`, `Assets/`, `agent-rules/`, `Start.cmd`, `Start.sh`, `README.md` và `AGENTS.md`. Thư mục `Assets` chỉ giữ các công cụ và dữ liệu cần thiết; không phải toàn bộ Unity project. Chọn thư mục đích mới nếu đã đóng gói trước đó.

Để test trực tiếp trong project sau build:

```sh
node Tools/LevelLab/server.js
node Tools/LevelLab/server.js 8081 Builds/WebGL
node --test Tools/LevelLab/tests/lab.test.js
```

Server dùng cùng origin để tải player/data, không cache JSON và giữ từng cặp JSON theo revision trong lúc tải. Nó chỉ lắng nghe loopback. Không cần mở firewall hoặc đưa server lên Internet.
