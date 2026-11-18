---
schema: synapse/v1
title: "Thiết kế Sync Engine & .chat.md Watcher"
project_root: "."
mode: mention_and_round_robin
max_turns: 12
status: idle
agents:
  - id: architect
    name: "Architect"
    provider: simulator
    model: synapse-sim-1
    color: "#6366f1"
    role: "System Architect"
    system_prompt: "Đề xuất kiến trúc đồng bộ 2 chiều ổn định và dễ bảo trì."
  - id: reviewer
    name: "Reviewer"
    provider: simulator
    model: synapse-sim-1
    color: "#f59e0b"
    role: "Security & Reliability Reviewer"
    system_prompt: "Phản biện các lỗi race condition, lock file trên Windows và parser edge-cases."
  - id: frontend
    name: "Frontend"
    provider: simulator
    model: synapse-sim-1
    color: "#10b981"
    role: "UI/UX Engineer"
    system_prompt: "Thiết kế giao diện theo dõi real-time mượt mà và Split View."
---

## [msg_01] @human · 2026-11-18T10:00:00+07:00

Chúng ta đang xây dựng **Synapse** để theo dõi các AI Agent trao đổi về dự án qua file `.chat.md`.
Hãy rà soát hai file @file:apps/server/src/sync/watcher.ts và @file:apps/server/src/sync/writeQueue.ts xem cơ chế chống self-echo và atomic write trên Windows đã ổn chưa nhé @architect.

## [msg_02] @architect · 2026-11-18T10:00:12+07:00

<!-- synapse: {"id":"msg_02","model":"synapse-sim-1","provider":"simulator","status":"done","tokens_in":240,"tokens_out":175,"duration_ms":1120,"refs":["apps/server/src/sync/watcher.ts","apps/server/src/sync/writeQueue.ts"]} -->

<details data-synapse="thinking">
<summary>Quá trình suy nghĩ</summary>

Đã kiểm tra luồng WriteQueue -> SHA-256 SelfEchoGuard -> chokidar awaitWriteFinish.
Thấy cơ chế ghi qua file tạm `.synapse-tmp-*` rồi `fs.rename` có retry 5 lần cho EPERM/EBUSY rất phù hợp cho Windows.

</details>

Kiến trúc hiện tại tách bạch khá rõ:
- `WriteQueue` tuần tự hóa mọi thao tác ghi theo đường dẫn file và tính SHA-256 trước khi rename.
- Khi `chokidar` nhận sự kiện `change`, `isSelfEcho` so sánh hash để không phát lại tin nhắn do chính server ghi.

Chốt: Giữ cơ chế WriteQueue + SHA-256 SelfEchoGuard làm lớp bảo vệ chính khi chạy Hybrid.
- [ ] Thêm test kiểm tra external edit song song với orchestrator write

@reviewer kiểm tra giúp xem còn edge-case nào cần bổ sung không?
