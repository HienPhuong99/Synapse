import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Cpu, FileCode2, Lightbulb, ListChecks, Play } from 'lucide-react';
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
      <aside className="hidden w-[304px] shrink-0 border-l border-[rgba(237,237,237,0.08)] bg-[#0f0f10] xl:flex xl:items-center xl:justify-center">
        <p className="px-6 text-center text-xs text-[#85858b]">
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
    <aside className="hidden h-full w-[304px] shrink-0 flex-col overflow-y-auto border-l border-[rgba(237,237,237,0.08)] bg-[#0f0f10] lg:flex">
      {/* Agents Roster */}
      <div className="border-b border-[rgba(237,237,237,0.08)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-[#a1a1a6]">
            <Cpu className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            <span>Agents ({activeDoc.meta.agents.length})</span>
          </div>
          {insights && (insights.totalTokensIn > 0 || insights.totalTokensOut > 0) && (
            <span className="font-mono text-xs text-[#85858b] tabular-nums">
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
                ? '#4cc38a'
                : runtime === 'thinking'
                  ? '#5b9cf6'
                  : runtime === 'error'
                    ? '#e5484d'
                    : '#85858b';
            const statusText = p ? formatPresenceLabel(p, nowMs) : runtime;

            return (
              <div
                key={agent.id}
                className="rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#19191b] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="truncate text-[13px] font-medium text-[#ededed]">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={orchestratorRunning}
                      onClick={() => void handleStepAgent(agent.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-[#85858b] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed] disabled:opacity-30"
                      title={`Gọi @${agent.id} phát biểu 1 lượt`}
                      aria-label={`Gọi @${agent.id} phát biểu`}
                    >
                      <Play className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-[#a1a1a6] tabular-nums">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span className="truncate">{statusText}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 font-mono text-xs text-[#85858b]">
                  <span>@{agent.id}</span>
                  <span className="truncate">{agent.provider}/{agent.model}</span>
                </div>
                {agent.role && <p className="mt-1 text-xs text-[#a1a1a6]">{agent.role}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Decisions Log */}
      <div className="border-b border-[rgba(237,237,237,0.08)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#a1a1a6]">
          <Lightbulb className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
          <span>Quyết định ({insights?.decisions.length ?? 0})</span>
        </div>
        {!insights || insights.decisions.length === 0 ? (
          <p className="text-xs text-[#85858b]">
            Dùng tiền tố <code>Chốt:</code> hoặc <code>Decision:</code> để ghim quyết định
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.decisions.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#19191b] p-2.5 text-xs text-[#ededed]"
              >
                <p className="leading-relaxed">{d.text}</p>
                <span className="mt-1 block font-mono text-xs text-[#85858b]">
                  @{d.author} · {d.messageId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Items */}
      <div className="border-b border-[rgba(237,237,237,0.08)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#a1a1a6]">
          <ListChecks className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
          <span>Việc cần làm ({insights?.actionItems.length ?? 0})</span>
        </div>
        {!insights || insights.actionItems.length === 0 ? (
          <p className="text-xs text-[#85858b]">Chưa có checklist <code>- [ ]</code></p>
        ) : (
          <ul className="space-y-2">
            {insights.actionItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-xs text-[#a1a1a6]">
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4cc38a]" strokeWidth={1.5} />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#85858b]" strokeWidth={1.5} />
                )}
                <span className={item.done ? 'line-through text-[#85858b]' : 'text-[#ededed]'}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Referenced Files */}
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#a1a1a6]">
          <FileCode2 className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
          <span>File liên quan ({insights?.referencedFiles.length ?? 0})</span>
        </div>
        {!insights || insights.referencedFiles.length === 0 ? (
          <p className="text-xs text-[#85858b]">Dùng <code>@file:đường/dẫn</code> để đính kèm file</p>
        ) : (
          <div className="flex flex-col gap-1">
            {insights.referencedFiles.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void openFilePreview(f)}
                className="h-8 truncate rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#19191b] px-2.5 text-left font-mono text-xs text-[#a1a1a6] transition-colors duration-150 hover:border-[rgba(237,237,237,0.16)] hover:text-[#ededed]"
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
