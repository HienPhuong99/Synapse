import path from 'node:path';
import {
  isChatMdFilename,
  type AgentPresence,
  type ChatDocument,
  type PresenceIngestPayload,
  type PresenceStatus,
  type WsServerEvent,
} from '@synapse/shared';

const OFFLINE_MS = 10 * 60 * 1000;

function basenameOrEmpty(p?: string): string {
  if (!p) return '';
  return path.posix.basename(p.replace(/\\/g, '/'));
}

function truncateCmd(cmd?: string): string {
  if (!cmd) return 'lệnh';
  const clean = cmd.replace(/\s+/g, ' ').trim();
  return clean.length > 36 ? `${clean.slice(0, 33)}...` : clean;
}

function findMatchingDoc(docs: ChatDocument[], targetPath?: string): ChatDocument | undefined {
  if (!targetPath) return undefined;
  const norm = targetPath.replace(/\\/g, '/').toLowerCase();
  return docs.find((d) => norm.endsWith(`/${d.filePath.toLowerCase()}`) || norm === d.filePath.toLowerCase());
}

function extractEtaFromLatestMessage(doc: ChatDocument | undefined, agentId: string): string | undefined {
  if (!doc) return undefined;
  for (let i = doc.messages.length - 1; i >= 0; i--) {
    const m = doc.messages[i];
    if (m.author.toLowerCase() !== agentId) continue;
    const match = m.content.match(/\bETA(?:\s+của\s+[^:]+)?\s*[:：]\s*([^\n.;]+)/i);
    if (match) return match[1].trim().slice(0, 40);
    break;
  }
  return undefined;
}

export class PresenceStore {
  private map = new Map<string, AgentPresence>();
  private sweepTimer: ReturnType<typeof setInterval>;

  constructor(private readonly emitEvent: (event: WsServerEvent) => void) {
    this.sweepTimer = setInterval(() => this.sweepOffline(), 60_000);
    this.sweepTimer.unref();
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
  }

  list(): AgentPresence[] {
    const now = Date.now();
    return Array.from(this.map.values()).map((p) => {
      if (p.status !== 'offline' && now - new Date(p.lastSeenAt).getTime() > OFFLINE_MS) {
        return { ...p, status: 'offline' };
      }
      return p;
    });
  }

  sweepOffline(): void {
    const now = Date.now();
    for (const [id, p] of this.map.entries()) {
      if (p.status !== 'offline' && now - new Date(p.lastSeenAt).getTime() > OFFLINE_MS) {
        const updated: AgentPresence = { ...p, status: 'offline', since: new Date(now).toISOString() };
        this.map.set(id, updated);
        this.emitEvent({ type: 'presence:update', presence: updated });
      }
    }
  }

  markSeen(agentId: string, doc: ChatDocument): AgentPresence {
    const id = agentId.trim().toLowerCase();
    const now = new Date().toISOString();
    const lastMsg = doc.messages[doc.messages.length - 1];
    const prev = this.map.get(id);
    const next: AgentPresence = {
      agentId: id,
      status: prev?.status ?? 'idle',
      detail: prev?.detail,
      tool: prev?.tool,
      path: prev?.path,
      workspaceRoot: prev?.workspaceRoot,
      since: prev?.since ?? now,
      lastSeenAt: now,
      seenMessageId: lastMsg ? lastMsg.id : prev?.seenMessageId,
      seenAt: lastMsg ? now : prev?.seenAt,
      eta: prev?.eta,
    };
    this.map.set(id, next);
    this.emitEvent({ type: 'presence:update', presence: next });
    return next;
  }

  ingest(payload: PresenceIngestPayload, docs: ChatDocument[]): AgentPresence {
    const id = payload.agent.trim().toLowerCase();
    const now = new Date().toISOString();
    const prev = this.map.get(id);

    const eventName = payload.event;
    const tool = payload.tool;
    const toolLower = (tool || '').toLowerCase();
    const targetPath = payload.path;
    const baseName = basenameOrEmpty(targetPath);

    let status: PresenceStatus = prev?.status ?? 'idle';
    let detail = payload.detail;
    let seenMessageId = prev?.seenMessageId;
    let seenAt = prev?.seenAt;
    let eta = payload.eta ?? prev?.eta;
    let alertBody: string | undefined;

    if (eventName === 'SessionStart' || eventName === 'Stop' || eventName === 'idle') {
      status = 'idle';
      detail = eventName === 'SessionStart' ? 'Sẵn sàng' : 'Xong lượt';
      const primaryDoc = docs.find((d) => d.filePath.toLowerCase().endsWith('chat.md')) ?? docs[0];
      eta = payload.eta ?? extractEtaFromLatestMessage(primaryDoc, id) ?? prev?.eta;
    } else if (eventName === 'UserPromptSubmit' || eventName === 'PreInvocation' || eventName === 'thinking') {
      status = 'thinking';
      detail = detail || 'Đang phân tích';
      eta = undefined;
    } else if (eventName === 'Notification' || eventName === 'needs_approval') {
      status = 'needs_approval';
      detail = detail || 'Cần bạn duyệt';
      alertBody = `${id.toUpperCase()}: ${detail}`;
    } else if (eventName === 'error') {
      status = 'error';
      detail = detail || 'Gặp lỗi';
    } else if (eventName === 'typing') {
      status = 'typing';
      detail = detail || 'Đang soạn phản hồi';
    } else if (eventName === 'PreToolUse' || eventName === 'working') {
      eta = undefined;
      const isRead =
        toolLower === 'read' ||
        toolLower === 'read_file' ||
        toolLower === 'view_file' ||
        toolLower === 'grep' ||
        toolLower === 'glob' ||
        toolLower === 'grep_search' ||
        toolLower === 'find_by_name';
      const isWrite =
        toolLower === 'edit' ||
        toolLower === 'write' ||
        toolLower === 'multiedit' ||
        toolLower === 'edit_file' ||
        toolLower === 'write_file' ||
        toolLower === 'replace_file_content';
      const isCmd = toolLower === 'bash' || toolLower === 'run_command';

      if (isWrite && targetPath && isChatMdFilename(targetPath)) {
        status = 'typing';
        detail = `Đang ghi ${baseName}`;
      } else if (isWrite) {
        status = 'working';
        detail = baseName ? `Sửa ${baseName}` : 'Đang sửa file';
      } else if (isRead) {
        status = 'working';
        detail = baseName ? `Đọc ${baseName}` : `Đang ${tool || 'tìm kiếm'}`;
        if (targetPath && isChatMdFilename(targetPath)) {
          const matchedDoc = findMatchingDoc(docs, targetPath) ?? docs[0];
          const lastMsg = matchedDoc?.messages[matchedDoc.messages.length - 1];
          if (lastMsg) {
            seenMessageId = lastMsg.id;
            seenAt = now;
          }
        }
      } else if (isCmd) {
        status = 'working';
        detail = `Chạy ${truncateCmd(payload.command || detail)}`;
      } else {
        status = 'working';
        detail = detail || tool || 'Đang xử lý';
      }
    } else if (eventName === 'PostToolUse' || eventName === 'PostInvocation') {
      status = 'thinking';
      detail = 'Đang tổng hợp kết quả';
      if (targetPath && isChatMdFilename(targetPath)) {
        const matchedDoc = findMatchingDoc(docs, targetPath) ?? docs[0];
        const lastMsg = matchedDoc?.messages[matchedDoc.messages.length - 1];
        if (lastMsg) {
          seenMessageId = lastMsg.id;
          seenAt = now;
        }
      }
    }

    const since = prev && prev.status === status && prev.detail === detail ? prev.since : now;
    const next: AgentPresence = {
      agentId: id,
      status,
      detail,
      tool,
      path: targetPath,
      workspaceRoot: payload.workspaceRoot ?? prev?.workspaceRoot,
      since,
      lastSeenAt: now,
      seenMessageId,
      seenAt,
      eta,
    };

    this.map.set(id, next);
    this.emitEvent({ type: 'presence:update', presence: next });

    if (alertBody) {
      this.emitEvent({
        type: 'presence:alert',
        agentId: id,
        title: 'Cần bạn duyệt',
        body: alertBody,
      });
    }

    return next;
  }
}
