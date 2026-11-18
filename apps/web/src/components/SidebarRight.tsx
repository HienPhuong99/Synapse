import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Coins, Cpu, FileCode2, Lightbulb, ListChecks, Play } from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatPresenceLabel, presenceDotColor } from '../lib/presence.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function SidebarRight() {
  const { activeDoc, insights, agentStates, presences, orchestratorRunning, openFilePreview } = useSynapseStore();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasActivePresence = Object.values(presences).some(
    (p) => p.status === 'working' || p.status === 'thinking' || p.status === 'typing' || p.status === 'needs_approval'
  );

  useEffect(() => {
    if (!hasActivePresence) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActivePresence]);

  if (!activeDoc) {
    return (
      <aside className="glass hidden w-[300px] shrink-0 overflow-hidden rounded-[22px] xl:flex xl:items-center xl:justify-center">
        <p className="px-6 text-center text-xs leading-relaxed text-[var(--ink-3)]">
          Chọn một file <code>chat.md</code> để xem trạng thái Agent và quyết định
        </p>
      </aside>
    );
  }

  const statesForDoc = agentStates[activeDoc.filePath] ?? {};

  const handleStepAgent = async (agentId: string) => {
    await api.controlSession(activeDoc.filePath, 'step', agentId);
  };

  return (
    <aside className="glass hidden h-full w-[300px] shrink-0 flex-col overflow-y-auto rounded-[22px] lg:flex">
      {/* Agents Roster */}
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
            <Cpu className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
            <span>Agents ({activeDoc.meta.agents.length})</span>
          </div>
          {insights && (insights.totalTokensIn > 0 || insights.totalTokensOut > 0) && (
            <span className="font-mono text-xs text-[var(--ink-3)] tabular-nums">
              {insights.totalTokensIn + insights.totalTokensOut} tok
            </span>
          )}
        </div>

        <div className="space-y-2">
          {activeDoc.meta.agents.map((agent) => {
            const p = presences[agent.id.toLowerCase()];
            const runtime = statesForDoc[agent.id]?.state ?? 'idle';
            const dotColor = p
              ? presenceDotColor(p.status)
              : runtime === 'streaming'
                ? 'var(--positive)'
                : runtime === 'thinking'
                  ? 'var(--accent)'
                  : runtime === 'error'
                    ? 'var(--negative)'
                    : 'var(--ink-3)';
            const statusText = p ? formatPresenceLabel(p, nowMs) : runtime;

            return (
              <div key={agent.id} className="glass-sub rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/25"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{agent.name}</span>
                  </div>
                  <button
                    type="button"
                    disabled={orchestratorRunning}
                    onClick={() => void handleStepAgent(agent.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)] disabled:opacity-30"
                    title={`Gọi @${agent.id} phát biểu 1 lượt`}
                    aria-label={`Gọi @${agent.id} phát biểu`}
                  >
                    <Play className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-[var(--ink-2)] tabular-nums">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span className="truncate">{statusText}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--ink-3)]">
                  <span>@{agent.id}</span>
                  <span className="truncate">
                    {agent.provider}/{agent.model}
                  </span>
                </div>
                {agent.role && <p className="mt-1 text-xs text-[var(--ink-2)]">{agent.role}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Token & Budget (#7) */}
      {insights &&
        (insights.totalTokensIn > 0 ||
          insights.totalTokensOut > 0 ||
          insights.totalCostUsd > 0 ||
          activeDoc.meta.max_cost_usd) && (
          <div className="border-b border-[var(--line-soft)] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
                <Coins className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
                <span>Ngân sách</span>
              </div>
              <span className="font-mono text-xs font-semibold text-[var(--ink)] tabular-nums">
                ${insights.totalCostUsd.toFixed(4)}
                {activeDoc.meta.max_cost_usd ? ` / $${activeDoc.meta.max_cost_usd.toFixed(2)}` : ''}
              </span>
            </div>

            {typeof activeDoc.meta.max_cost_usd === 'number' &&
              activeDoc.meta.max_cost_usd > 0 &&
              (() => {
                const pct = Math.min(100, (insights.totalCostUsd / activeDoc.meta.max_cost_usd) * 100);
                const barColor =
                  pct >= 100 ? 'var(--negative)' : pct >= 80 ? 'var(--warning)' : 'var(--positive)';
                return (
                  <div className="glass-sub mb-3 h-2 w-full overflow-hidden rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                );
              })()}

            {insights.agentUsage.length > 0 && (
              <div className="space-y-1.5">
                {insights.agentUsage.map((u) => (
                  <div
                    key={u.agentId}
                    className="flex items-center justify-between font-mono text-xs text-[var(--ink-3)] tabular-nums"
                  >
                    <span className="truncate text-[var(--ink-2)]">
                      @{u.agentId} ({u.turns})
                    </span>
                    <span>
                      {u.tokensIn + u.tokensOut} tok · ${u.costUsd.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Decisions Log */}
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
          <Lightbulb className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
          <span>Quyết định ({insights?.decisions.length ?? 0})</span>
        </div>
        {!insights || insights.decisions.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">
            Dùng tiền tố <code>Chốt:</code> hoặc <code>Decision:</code> để ghim quyết định
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.decisions.map((d) => (
              <li key={d.id} className="glass-sub rounded-xl p-2.5 text-xs text-[var(--ink)]">
                <p className="leading-relaxed">{d.text}</p>
                <span className="mt-1 block font-mono text-[11px] text-[var(--ink-3)]">
                  @{d.author} · {d.messageId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Items */}
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
          <ListChecks className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
          <span>Việc cần làm ({insights?.actionItems.length ?? 0})</span>
        </div>
        {!insights || insights.actionItems.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">
            Chưa có checklist <code>- [ ]</code>
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.actionItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
                {item.done ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: 'var(--positive)' }}
                    strokeWidth={1.6}
                  />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" strokeWidth={1.6} />
                )}
                <span className={item.done ? 'line-through text-[var(--ink-3)]' : 'text-[var(--ink)]'}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Referenced Files */}
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
          <FileCode2 className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
          <span>File liên quan ({insights?.referencedFiles.length ?? 0})</span>
        </div>
        {!insights || insights.referencedFiles.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)]">
            Dùng <code>@file:đường/dẫn</code> để đính kèm file
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {insights.referencedFiles.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void openFilePreview(f)}
                className="glass-btn h-8 truncate rounded-xl px-2.5 text-left font-mono text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
                title={f}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
