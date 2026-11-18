import { useEffect, useRef, useState } from 'react';
import { FolderGit2, RefreshCw, Settings } from 'lucide-react';
import { useSynapseStore } from '../store/useSynapseStore.ts';
import {
  applyClearPercent,
  getCurrentClearPercent,
  getCurrentTheme,
  toggleThemeWithTransition,
  type ThemeMode,
} from '../lib/theme.ts';

interface TopMenubarProps {
  onSwitchWorkspace: () => void;
  onOpenSettings: () => void;
}

const CLEAR_PRESETS = [
  { label: 'Mờ đục', value: 12 },
  { label: 'Cân bằng', value: 45 },
  { label: 'Trong suốt', value: 85 },
] as const;

function formatClock(now: Date): string {
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const d = days[now.getDay()];
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${d} ${dd}/${mm} · ${hh}:${mi}`;
}

export function TopMenubar({ onSwitchWorkspace, onOpenSettings }: TopMenubarProps) {
  const { workspaceRoot, wsConnected, loadWorkspace } = useSynapseStore();
  const [theme, setTheme] = useState<ThemeMode>(() => getCurrentTheme());
  const [clearPercent, setClearPercent] = useState<number>(() => getCurrentClearPercent());
  const [clearOpen, setClearOpen] = useState(false);
  const [clockText, setClockText] = useState(() => formatClock(new Date()));

  const themeBtnRef = useRef<HTMLButtonElement | null>(null);
  const clearWrapRef = useRef<HTMLDivElement | null>(null);
  const clearBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setClockText(formatClock(new Date())), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clearOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (clearWrapRef.current && e.target instanceof Node && !clearWrapRef.current.contains(e.target)) {
        setClearOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClearOpen(false);
        clearBtnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [clearOpen]);

  const handleToggleTheme = () => {
    toggleThemeWithTransition(themeBtnRef.current, (next) => setTheme(next));
  };

  const handleClearChange = (rawVal: number) => {
    const snap = CLEAR_PRESETS.find((p) => Math.abs(p.value - rawVal) <= 2);
    const next = applyClearPercent(snap ? snap.value : rawVal, true);
    setClearPercent(next);
  };

  return (
    <header className="glass-bar relative z-40 flex h-11 shrink-0 items-center justify-between gap-3 px-4 text-[13px] font-medium text-[var(--ink)]">
      {/* Left: Brand, Workspace & Connection */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <span
            className="flex h-7 w-7 items-center justify-center"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(15, 45, 80, 0.22))' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 64 64" fill="none" className="h-7 w-7">
              <defs>
                <linearGradient id="synapse-lg-top" x1="14" y1="12" x2="46" y2="42" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.92" />
                  <stop offset="45%" stopColor="#38BDF8" stopOpacity="0.72" />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity="0.86" />
                </linearGradient>
                <linearGradient id="synapse-lg-bot" x1="20" y1="24" x2="52" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="synapse-lg-rim" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                  <stop offset="50%" stopColor="#7DD3FC" stopOpacity="0.48" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.82" />
                </linearGradient>
              </defs>
              <path
                d="M32 10C19.85 10 10 19.85 10 32C10 37.15 11.8 41.9 14.8 45.65C20.5 34.65 30.4 34.1 32 32C33.6 29.9 43.5 29.35 49.2 18.35C45.45 13.25 39.1 10 32 10Z"
                fill="url(#synapse-lg-top)"
              />
              <path
                d="M32 54C44.15 54 54 44.15 54 32C54 26.85 52.2 22.1 49.2 18.35C43.5 29.35 33.6 29.9 32 32C30.4 34.1 20.5 34.65 14.8 45.65C18.55 50.75 24.9 54 32 54Z"
                fill="url(#synapse-lg-bot)"
              />
              <circle cx="32" cy="32" r="22" stroke="url(#synapse-lg-rim)" strokeWidth="2" />
              <path
                d="M18 22.2C21 17 26.1 13.8 32 13.6"
                stroke="#FFFFFF"
                strokeOpacity="0.92"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M15.2 45.1C20.8 34.6 30.4 34.1 32 32C33.6 29.9 43.2 29.4 48.8 18.9"
                stroke="#FFFFFF"
                strokeOpacity="0.84"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h1
            className="text-[14px] font-bold tracking-tight text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-head)' }}
          >
            Synapse
          </h1>
        </div>

        <button
          type="button"
          onClick={onSwitchWorkspace}
          className="glass-btn hidden h-7 max-w-[280px] items-center gap-1.5 rounded-lg px-2.5 text-left font-mono text-[11.5px] text-[var(--ink-2)] hover:text-[var(--ink)] sm:inline-flex"
          title="Đổi thư mục dự án"
        >
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.6} />
          <span className="truncate">{workspaceRoot || 'Chọn dự án'}</span>
        </button>

        <button
          type="button"
          onClick={() => void loadWorkspace()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-2)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="Làm mới workspace"
          aria-label="Làm mới workspace"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>

      {/* Right: Status, Clock, Settings, Clearness, Day/Night Toggle */}
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="hidden items-center gap-1.5 px-2 font-mono text-[11.5px] text-[var(--ink-2)] lg:inline-flex"
          title={wsConnected ? 'WebSocket đã kết nối' : 'Mất kết nối WebSocket'}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: wsConnected ? 'var(--positive)' : 'var(--negative)',
              boxShadow: wsConnected
                ? '0 0 0 3px color-mix(in oklch, var(--positive) 24%, transparent)'
                : '0 0 0 3px color-mix(in oklch, var(--negative) 24%, transparent)',
            }}
          />
          {wsConnected ? 'Đã kết nối' : 'Mất kết nối'}
        </span>

        <span className="hidden px-1.5 font-mono text-[11.5px] text-[var(--ink-2)] tabular-nums md:inline">
          {clockText}
        </span>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="Cài đặt API Keys & Ollama"
          aria-label="Cài đặt"
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
          <span className="hidden sm:inline">Cài đặt</span>
        </button>

        {/* Transparency ("Độ trong suốt") Control */}
        <div className="relative flex-none" ref={clearWrapRef}>
          <button
            ref={clearBtnRef}
            type="button"
            className="clear-btn"
            aria-label="Điều chỉnh độ trong suốt"
            aria-expanded={clearOpen}
            aria-controls="synapse-clear-pop"
            title="Độ trong suốt"
            onClick={() => setClearOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path className="fill" d="M12 3.5a8.5 8.5 0 0 1 0 17z" />
            </svg>
          </button>

          {clearOpen && (
            <div
              id="synapse-clear-pop"
              role="dialog"
              aria-label="Độ trong suốt"
              className="clear-pop glass-modal"
            >
              <div className="flex items-baseline justify-between text-[13px] font-semibold text-[var(--ink)]">
                <span>Độ trong suốt</span>
                <output className="font-mono text-xs font-medium text-[var(--ink-3)] tabular-nums">
                  {clearPercent}%
                </output>
              </div>
              <input
                className="cp-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={clearPercent}
                style={{ '--fill': `${clearPercent}%` } as React.CSSProperties}
                onChange={(e) => handleClearChange(Number(e.target.value))}
                aria-label="Độ trong suốt"
              />
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Mức có sẵn">
                {CLEAR_PRESETS.map((preset) => {
                  const active = clearPercent === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const next = applyClearPercent(preset.value, true);
                        setClearPercent(next);
                      }}
                      className={`rounded-xl border py-1.5 text-[12px] font-semibold transition-colors ${
                        active
                          ? 'border-transparent bg-[var(--btn)] text-[var(--btn-ink)]'
                          : 'border-[var(--edge)] bg-[var(--glass-2)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Day / Night Pill Toggle */}
        <button
          ref={themeBtnRef}
          type="button"
          className="theme-toggle"
          onClick={handleToggleTheme}
          aria-label="Chuyển giao diện ngày/đêm"
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Chuyển sang giao diện ngày' : 'Chuyển sang giao diện đêm'}
        />
      </div>
    </header>
  );
}
