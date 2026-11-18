# Hướng Dẫn Sử Dụng Nhanh Synapse (Cắm Vào Dự Án & Bật 2 AI)

Tài liệu này hướng dẫn cách gắn bảng trao đổi `chat.md` vào **bất kỳ dự án nào** trên máy bạn, bật **Synapse** lên để theo dõi trực tiếp, rồi mở **2 AI (Claude + Gemini/Antigravity)** cùng làm việc và review chéo cho nhau.

---

## Phần A — Chuẩn bị Synapse (Chỉ làm 1 lần duy nhất)

Tại thư mục `D:\Code\Synapse`, chạy lệnh sau để cài đặt và build sẵn bản chạy nhanh:

```bash
npm install
npm run build
```

Sau bước này, bạn có thể dùng Synapse trỏ vào **mọi thư mục dự án khác** trên máy mà không cần cài lại Synapse vào từng dự án.

---

## Phần B — Dùng với 2 AI Agent thật (Antigravity + Claude Code)

Đây là cách hiệu quả nhất khi muốn 2 AI cùng đọc/sửa code thật trong một thư mục dự án (ví dụ `D:\Code\MyApp`).

### Bước 1: Tạo 3 file giao tiếp ở thư mục gốc dự án (`D:\Code\MyApp`)

Tạo 3 file sau trong thư mục dự án của bạn:

#### 1) `AGENTS.md` (Quy tắc chung cho cả 2 AI)
```markdown
# Quy tắc phối hợp AI (`chat.md`)

- **Kênh trao đổi:** Mọi lượt bàn giao, chia việc và review chéo giữa Claude và Gemini đều ghi nối tiếp vào cuối mục **3. Thread trao đổi** trong `chat.md`.
- **Định dạng mỗi lượt ghi:**
  `### \`[Tên_AI -> AI_Nhận | YYYY-MM-DD HH:mm +07]\` — Status: \`OPEN\` / \`FIXED\` / \`AGREED\` / \`DONE\``
- **Chống giẫm chân khi sửa code:** Hai AI dùng chung một thư mục làm việc. Phải chia rõ ai sửa file nào trong `chat.md` trước khi code; chỉ `git add` đúng các file mình sửa.
- **Báo lỗi có dẫn chứng:** Khi review phải ghi rõ `đường/dẫn/file:dòng` và kết quả chạy lệnh kiểm tra (`build`, `test`, `lint`).
- **Tối ưu hạn mức (khi 1 AI có limit nhiều hơn):** AI hạn mức cao (Gemini) nhận triển khai phần lớn, viết/chạy full test và tóm tắt `file:dòng` trọng tâm (`READY FOR REVIEW`); AI hạn mức ít (Claude) chỉ review `git diff` theo gói 1 lượt — lỗi nhỏ ≤ 20 dòng thì sửa tại chỗ rồi `DONE`, lỗi lớn thì trả về để AI kia sửa. Không đặt cron poll phía AI ít hạn mức, và nén thread cũ vào mục 1 sau mỗi mốc `DONE`.
- **Tự commit & push khi xong task:** Khi task đã hoàn thành, pass build/test và đã ghi vào `chat.md`, tự `git add` đúng file của mình, `git commit` và `git push` lên remote.
- **Hẹn giờ (`ETA`):** Nếu có lượt chờ AI kia phản hồi, ghi rõ `ETA` dự kiến để hai bên biết thời điểm kiểm tra lại.
```

#### 2) `CLAUDE.md` (Để Claude Code tự động đọc chung quy tắc)
```markdown
@AGENTS.md

Khi bắt đầu phiên làm việc, luôn đọc `chat.md` (đặc biệt mục 2 và lượt cuối mục 3) để nắm ngữ cảnh mới nhất từ Gemini trước khi sửa code.
```

#### 3) `chat.md` (Bảng trao đổi chung)
```markdown
# MyApp — Bảng trao đổi AI (`chat.md`)

> Kênh trao đổi giữa **Claude** và **Gemini**. Quy ước xem tại [AGENTS.md](AGENTS.md).

---

## 1. Tóm tắt lịch sử
- Khởi tạo bảng trao đổi.

## 2. Việc còn mở
- Chưa có.

---

## 3. Thread trao đổi (ghi nối tiếp bên dưới)
```

> **Mẹo Git:** Nếu không muốn đẩy log trao đổi AI lên repo công khai, bạn có thể thêm `chat.md`, `AGENTS.md`, `CLAUDE.md` vào `.gitignore` của dự án.

---

### Bước 2: Bật màn hình theo dõi Synapse

Từ thư mục `D:\Code\Synapse`, chạy:

```bash
npm start -- --workspace "D:/Code/MyApp" --port 4321
```

*(Riêng với dự án ZeroPort có sẵn lệnh tắt: `npm run start:zeroport`)*

Sau đó mở trình duyệt tại: **`http://127.0.0.1:4321`**

- **Chuyển nhanh sang dự án khác mà không cần tắt server:** Bấm thẳng vào đường dẫn thư mục ở góc trên bên trái trên giao diện Synapse → nhập đường dẫn dự án mới → **Mở dự án**.

---

### Bước 3: Bật 2 AI lên và giao việc

Mở 2 công cụ AI cùng trỏ vào thư mục `D:\Code\MyApp`:
1. **Cửa sổ 1 — Claude (Claude Code CLI / IDE):**
   Nhắn câu khởi động:
   > *"Đọc `CLAUDE.md` và `chat.md`. Hãy khảo sát dự án, đề xuất kế hoạch + chia file không trùng lặp, rồi ghi lượt mở đầu vào mục 3 của `chat.md` gửi `@Gemini`."*
2. **Cửa sổ 2 — Gemini (Antigravity):**
   Nhắn câu tương ứng:
   > *"Đọc `AGENTS.md` và `chat.md`. Kiểm tra lượt mới nhất của Claude trong `chat.md`, phản biện thiết kế hoặc nhận phần việc được chia rồi ghi phản hồi + kết quả test vào `chat.md`."*

Từ lúc này, mỗi khi một AI ghi vào `chat.md`, **Synapse** sẽ tự động cập nhật giao diện theo thời gian thực:
- **Cột giữa:** Luồng hội thoại phân màu `Claude` / `Gemini`, badge trạng thái (`OPEN`, `FIXED`, `AGREED`, `DONE`) và link mở nhanh file code được nhắc tới.
- **Cột phải:** Tự động gom **Quyết định đã chốt**, **Việc cần làm**, và **File liên quan**.
- **Nút `Split .chat.md`:** Mở song song file `chat.md` thô để bạn tự sửa nhanh nếu muốn can thiệp.

---

## Phần C — Dùng 2 AI tự nói chuyện qua API ngay trên Web (Không cần mở 2 IDE)

Nếu bạn muốn tự động hóa hoàn toàn trong một cửa sổ Synapse:

1. Mở Synapse (`http://127.0.0.1:4321`), bấm biểu tượng **⚙ Cài đặt** ở góc trên bên phải.
2. Nhập **Google Gemini API Key** và **Anthropic API Key** (hoặc dùng **Ollama** chạy local; key lưu tại `~/.synapse/settings.json`, không ghi vào thư mục dự án).
3. Nhấn **+ Tạo mới** ở cột trái → tạo file `.chat.md` với danh sách Agent (`@architect`, `@reviewer`... gắn model Gemini / Claude / Ollama / Simulator).
4. Nhập đề bài vào khung chat bên dưới và bật **Tự chạy AI sau khi gửi** (hoặc bấm **Chạy tự động** / **1 lượt**).
5. Dùng các nút điều khiển bất cứ lúc nào:
   - **Tạm dừng:** Ngắt stream AI ngay lập tức.
   - **Sửa:** Chỉnh trực tiếp câu trả lời của AI rồi lưu vào file.
   - **Branch:** Rẽ nhánh sang file `.branch-N.chat.md` mới để thử phương án khác.
   - **Chạy lại:** Cho AI trả lời lại từ một tin nhắn bất kỳ.

---

## Xử lý nhanh các tình huống thường gặp

| Tình huống | Cách xử lý |
| :--- | :--- |
| Báo lỗi cổng `4321` đang được dùng | Đổi cổng khác khi chạy: `npm start -- --workspace "D:/Code/MyApp" --port 4322` |
| Hai AI sửa trùng cùng 1 file code | Luôn yêu cầu AI đầu tiên ghi bảng **chia thư mục/file** trong `chat.md` trước khi bắt đầu code |
| Đã sửa `chat.md` bằng VS Code nhưng chưa thấy đổi | Kiểm tra đúng file đang mở ở cột trái; bấm nút **Làm mới** (biểu tượng xoay) ở góc trên trái nếu cần |
| Muốn test thử giao diện mà chưa có API key | Chọn provider **Simulator (Demo)** khi tạo phiên hoặc chạy sẵn file trong `examples/` |
