---
schema: synapse/v1
title: Tối ưu trải nghiệm Split View & Streaming UI
project_root: .
mode: mention_and_round_robin
max_turns: 10
status: idle
agents:
  - id: frontend
    name: Frontend
    provider: simulator
    model: synapse-sim-1
    color: "#10b981"
    role: UI/UX Engineer
  - id: architect
    name: Architect
    provider: simulator
    model: synapse-sim-1
    color: "#6366f1"
    role: System Architect
---

## [msg_01] @human · 2026-11-18T10:05:00+07:00

Khi AI đang stream token liên tục, làm sao để giao diện mượt mà mà không làm Raw `.chat.md` Split View bị ghi đè khi người dùng đang gõ tay? @frontend và @architect cho ý kiến nhé.

## [msg_02] @frontend · 2026-11-18T03:15:20.226Z

<!-- synapse: {"id":"msg_02","model":"synapse-sim-1","provider":"simulator","status":"done","tokens_in":80,"tokens_out":180,"duration_ms":3673,"refs":[]} -->

<details data-synapse="thinking">
<summary>Quá trình suy nghĩ</summary>

Vai trò: UI/UX Engineer (synapse-sim-1).
Đang phân tích dựa trên luồng trao đổi hiện tại của phòng.
Phản hồi tin nhắn mới nhất của @human: "Khi AI đang stream token liên tục, làm sao để giao diện mượt mà mà không làm Raw `.chat.md..."

</details>

Dưới góc độ **UI/UX Engineer**, tôi đề xuất cách hiển thị trực quan cho luồng này:

- Tin nhắn đang stream dùng state tạm (**ephemeral draft**) để UI mượt 60fps mà không spam sự kiện ghi file.
- Khi người dùng bật **Split View**, giữ scroll đồng bộ giữa Markdown render và raw `.chat.md`.

Chốt: Tách store streaming tách biệt khỏi document đã lưu trên đĩa.
- [ ] Thêm nút Branch & Edit trực tiếp trên từng MessageCard

@architect phần payload WebSocket hiện tại đã đủ thông tin chưa?
