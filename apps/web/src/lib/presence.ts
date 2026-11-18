import type { AgentPresence, PresenceStatus } from '@synapse/shared';

export function presenceDotColor(status: PresenceStatus): string {
  switch (status) {
    case 'typing':
    case 'working':
      return '#4cc38a';
    case 'thinking':
      return '#5b9cf6';
    case 'needs_approval':
      return '#e5a04d';
    case 'error':
      return '#e5484d';
    case 'idle':
      return '#a1a1a6';
    case 'offline':
    default:
      return '#52525b';
  }
}

export function formatPresenceLabel(p: AgentPresence, nowMs: number): string {
  const isActive =
    p.status === 'working' ||
    p.status === 'thinking' ||
    p.status === 'typing' ||
    p.status === 'needs_approval';
  const elapsedSec = isActive ? Math.max(0, Math.floor((nowMs - new Date(p.since).getTime()) / 1000)) : 0;
  const elapsedSuffix = isActive && elapsedSec >= 1 ? ` · ${elapsedSec}s` : '';

  switch (p.status) {
    case 'needs_approval':
      return `${p.detail || 'Cần bạn duyệt'}${elapsedSuffix}`;
    case 'typing':
      return `${p.detail || 'Đang nhắn'}${elapsedSuffix}`;
    case 'thinking':
      return `${p.detail || 'Đang suy nghĩ'}${elapsedSuffix}`;
    case 'working':
      return `${p.detail || 'Đang làm'}${elapsedSuffix}`;
    case 'error':
      return p.detail || 'Lỗi';
    case 'idle':
      return p.eta ? `Rảnh · ETA ${p.eta}` : 'Rảnh';
    case 'offline':
    default:
      return 'Ngoại tuyến';
  }
}
