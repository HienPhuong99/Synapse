import { CheckCircle2, Circle, Cpu, FileCode2, Lightbulb, ListChecks, Play } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function SidebarRight() {
  const { activeDoc, insights, agentStates, orchestratorRunning, openFilePreview } = useSynapseStore();

  if (!activeDoc) {
    return (
      <aside className="hidden w-80 shrink-0 border-l border-zinc-800/90 bg-zinc-950/90 xl:flex xl:items-center xl:justify-center">
        <p className="px-6 text-center text-xs text-zinc-500">
          Chọn một file <code>.chat.md</code> để xem trạng thái Agent và tóm tắt quyết định.
        </p>
      </aside>
    );
  }

  const statesForDoc = agentStates[activeDoc.filePath] ?? {};

  const handleStepAgent = async (agentId: string) => {
    await api.controlSession(activeDoc.filePath, 'step', agentId);
  };

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-800/90 bg-zinc-950/90 lg:flex">
      {/* Agents Roster */}
      <div className="border-b border-zinc-800/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Cpu className="h-3.5 w-3.5 text-indigo-400" />
            AI Agents ({activeDoc.meta.agents.length})
          </div>
          {insights && (
            <span className="font-mono text-[10px] text-zinc-500">
              {insights.totalTokensIn + insights.totalTokensOut} tok
            </span>
          )}
        </div>

        <div className="space-y-2">
          {activeDoc.meta.agents.map((agent) => {
            const runtime = statesForDoc[agent.id]?.state ?? 'idle';
            const stateBadge =
              runtime === 'streaming'
                ? { label: 'streaming', cls: 'bg-emerald-500/20 text-emerald-300' }
                : runtime === 'thinking'
                  ? { label: 'thinking', cls: 'bg-amber-500/20 text-amber-300' }
                  : runtime === 'error'
                    ? { label: 'error', cls: 'bg-rose-500/20 text-rose-300' }
                    : { label: 'idle', cls: 'bg-zinc-800 text-zinc-400' };

            return (
              <div
                key={agent.id}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="truncate text-xs font-semibold text-zinc-100">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateBadge.cls}`}>
                      {stateBadge.label}
                    </span>
                    <button
                      type="button"
                      disabled={orchestratorRunning}
                      onClick={() => void handleStepAgent(agent.id)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300 disabled:opacity-30"
                      title={`Gọi @${agent.id} phát biểu 1 lượt`}
                    >
                      <Play className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                  <span>@{agent.id}</span>
                  <span className="truncate">{agent.provider}/{agent.model}</span>
                </div>
                {agent.role && <p className="mt-1 text-[11px] text-zinc-400">{agent.role}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Decisions Log */}
      <div className="border-b border-zinc-800/80 p-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
          Quyết định đã chốt ({insights?.decisions.length ?? 0})
        </div>
        {!insights || insights.decisions.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Chưa ghi nhận quyết định nào. Dùng tiền tố <code>Chốt: ...</code> hoặc <code>Decision: ...</code> trong tin nhắn.
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.decisions.map((d) => (
              <li key={d.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-zinc-200">
                <p>{d.text}</p>
                <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                  @{d.author} · {d.messageId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Items */}
      <div className="border-b border-zinc-800/80 p-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <ListChecks className="h-3.5 w-3.5 text-emerald-400" />
          Việc cần làm ({insights?.actionItems.length ?? 0})
        </div>
        {!insights || insights.actionItems.length === 0 ? (
          <p className="text-xs text-zinc-500">Chưa có checklist <code>- [ ]</code> nào.</p>
        ) : (
          <ul className="space-y-1.5">
            {insights.actionItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-xs text-zinc-300">
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                )}
                <span className={item.done ? 'line-through text-zinc-500' : ''}>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Referenced Files */}
      <div className="p-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <FileCode2 className="h-3.5 w-3.5 text-sky-400" />
          File liên quan ({insights?.referencedFiles.length ?? 0})
        </div>
        {!insights || insights.referencedFiles.length === 0 ? (
          <p className="text-xs text-zinc-500">Dùng <code>@file:đường/dẫn</code> để đính kèm file ngữ cảnh.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {insights.referencedFiles.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void openFilePreview(f)}
                className="truncate rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-left font-mono text-[11px] text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300"
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
