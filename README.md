# Synapse — Multi-Agent `chat.md` Observer & Orchestrator

**Synapse** là Web App Local giúp bạn **theo dõi** và **điều phối** nhiều AI Agent (như **Claude** và **Gemini**) trao đổi về dự án theo thời gian thực, sử dụng trực tiếp file **`chat.md`** hoặc **`*.chat.md`** ngay trong repo làm *Single Source of Truth*.

> Xem hướng dẫn từng bước để gắn vào bất kỳ dự án nào và bật 2 AI chạy ngay tại **[USER_GUIDE.md](USER_GUIDE.md)**.

## Tính năng chính
- **Hybrid Observer + Orchestrator:**
  - *Observer:* Theo dõi real-time bằng `chokidar`. Bất kỳ AI CLI/IDE nào (Claude Code, Antigravity, Cursor...) ghi vào `chat.md` hoặc `*.chat.md`, giao diện lập tức cập nhật.
  - *Orchestrator:* Cho phép nhiều AI Agent (`Gemini`, `Claude`, `OpenAI`, `Ollama`, hoặc `Simulator`) tự trao đổi qua API theo `@mention` / `round-robin` với `max_turns` & nút **Tạm dừng**.
- **Hỗ trợ cả 2 định dạng:** File `*.chat.md` chuẩn Synapse (`synapse/v1`) và file `chat.md` dạng thread `### \`[Claude -> Gemini | ...]\`` (như trong `ZeroPort`).
- **Chuyển dự án trực tiếp trên UI:** Bấm vào đường dẫn workspace ở góc trên trái để trỏ sang bất kỳ thư mục dự án nào trên máy.
- **Two-Way Raw Split View:** Xem giao diện chat trực quan song song với file Markdown thô.
- **Edit, Branch & Re-run:** Sửa nội dung tin nhắn AI, rẽ nhánh sang `.branch-N.chat.md`, hoặc chạy lại từ một tin nhắn bất kỳ.
- **Insights Sidebar:** Tự động tổng hợp **Quyết định**, **Việc cần làm (`- [ ]`)**, và **File liên quan**.

## Cài đặt & Chạy nhanh

```bash
npm install
npm run build
```

- **Trỏ vào một dự án bất kỳ (ví dụ `D:\Code\MyApp`):**
  ```bash
  npm start -- --workspace "D:/Code/MyApp" --port 4321
  ```
- **Mở nhanh dự án ZeroPort:**
  ```bash
  npm run start:zeroport
  ```
- **Chế độ dev (hot-reload):**
  ```bash
  npm run dev
  ```
  Mở `http://127.0.0.1:5173` (dev) hoặc `http://127.0.0.1:4321` (bản build).

## Chạy Test

```bash
npm test
```
