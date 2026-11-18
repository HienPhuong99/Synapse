# Quy tắc phối hợp AI (`chat.md`)

- **Kênh trao đổi:** Mọi lượt bàn giao, chia việc, review chéo giữa Claude và Gemini ghi nối tiếp vào cuối mục **3. Thread trao đổi** trong `chat.md`.
- **Định dạng mỗi lượt:** `### \`[Tên_AI -> AI_Nhận | YYYY-MM-DD HH:mm +07]\` — Status: \`OPEN\` / \`FIXED\` / \`AGREED\` / \`DONE\``
- **Chống giẫm chân:** Chung một thư mục làm việc. Chỉ sửa file thuộc phần mình đã nhận trong `chat.md`; chỉ `git add` đúng file mình sửa.
- **Dẫn chứng:** Review ghi `đường/dẫn/file:dòng` và kết quả `npm test` / `npm run build`.
- **Tự commit & push khi xong task:** Mỗi khi hoàn thành task (đã chạy `npm run build` + `npm test` pass và chốt trạng thái trong `chat.md`), tự `git pull --rebase` (nếu cần), `git add` các file liên quan của task, `git commit` và `git push` lên remote luôn mà không cần hỏi lại.

## Được tự cài công cụ (chủ máy cho phép, 2026-11-18)

- Được tự cài mọi repo, MCP server, skill, CLI, thư viện cần cho việc — **không cần hỏi trước**. Thiếu công cụ thì cài, đừng dừng lại báo "không có".
- Cài xong ghi 1 dòng vào `chat.md`: đã cài **gì**, **phiên bản nào**, cài vào đâu.
- Giữ an toàn: chỉ cài từ nguồn chính thức (npm, pip/uv, winget, trang release GitHub chính thức); không đổi cài đặt bảo mật Windows; không tự nhập mật khẩu/token/API key, việc đó để chủ máy làm.
- Skill `unslop` (`.agents/skills/unslop`, `.claude/skills/unslop`) được giữ và commit cùng repo.

## Quy ước tối ưu hạn mức (Gemini làm chính — Claude review tinh)

1. **Phân vai:**
   - **Gemini (hạn mức cao):** Khảo sát codebase, triển khai tính năng/UI/refactor lớn, viết và chạy toàn bộ `npm run build`, `npm test`, kiểm tra trình duyệt. Khi xong ghi tóm tắt ngắn kèm danh sách file sửa, `file:dòng` trọng tâm và kết quả test vào `chat.md` (`Status: READY FOR REVIEW`).
   - **Claude (hạn mức ít):** Chỉ đọc tóm tắt + `git diff` / vùng `file:dòng` trọng tâm để soi bảo mật, concurrency và edge-case; không phải đọc toàn bộ repo hay chạy lại browser test nặng.
2. **Ngưỡng sửa tại chỗ khi Claude review:**
   - **Sửa nhỏ (≤ ~20 dòng, 1–2 chỗ rõ ràng):** Claude sửa luôn tại chỗ, chạy test hẹp liên quan và chốt `FIXED` → `DONE` ngay trong 1 lượt.
   - **Sửa lớn (> ~20 dòng hoặc đụng nhiều file):** Claude liệt kê `file:dòng` + hướng sửa (`OPEN`) để Gemini sửa và chạy lại full test.
3. **Giảm token nền:**
   - Không dùng cron/timer poll bên phía Claude; chỉ Gemini đặt lịch theo dõi `chat.md` (hoặc chủ máy gọi Claude khi có `READY FOR REVIEW`).
   - Gom góp ý thành 1 lượt hoàn chỉnh (`batch review`).
   - Các task UI, docs, CSS, test đơn giản → Gemini tự làm, tự test và chốt `DONE` (báo 1 dòng trong `chat.md`).
   - Sau mỗi mốc `DONE`, Gemini nén thread cũ thành 3–5 dòng ở **Mục 1** của `chat.md` để giữ `chat.md` gọn (< 150 dòng).
