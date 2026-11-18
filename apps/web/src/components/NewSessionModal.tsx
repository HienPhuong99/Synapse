import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { AgentConfig, OrchestrationMode, ProviderKind } from '@synapse/shared';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'architect',
    name: 'Architect',
    role: 'System Architect',
    provider: 'simulator',
    model: 'synapse-sim-1',
    color: '#5b9cf6',
    system_prompt: 'Đề xuất kiến trúc rõ ràng, cân nhắc trade-off và khả năng mở rộng.',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Code & Security Reviewer',
    provider: 'simulator',
    model: 'synapse-sim-1',
    color: '#e5a04d',
    system_prompt: 'Phản biện edge-case, race condition, bảo mật và tính đơn giản.',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    role: 'UI/UX Engineer',
    provider: 'simulator',
    model: 'synapse-sim-1',
    color: '#4cc38a',
    system_prompt: 'Thiết kế trải nghiệm người dùng, streaming UI và quản lý state.',
  },
];

export function NewSessionModal({ open, onClose }: NewSessionModalProps) {
  const selectSession = useSynapseStore((s) => s.selectSession);
  const [title, setTitle] = useState('Thảo luận kiến trúc mới');
  const [fileName, setFileName] = useState(`session-${Date.now().toString().slice(-4)}.chat.md`);
  const [mode, setMode] = useState<OrchestrationMode>('mention_and_round_robin');
  const [maxTurns, setMaxTurns] = useState(8);
  const [maxCostUsd, setMaxCostUsd] = useState('');
  const [initialPrompt, setInitialPrompt] = useState(
    'Chúng ta cần thiết kế tính năng mới cho dự án. @architect đề xuất phương án trước.'
  );
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const updateAgent = (idx: number, patch: Partial<AgentConfig>) => {
    setAgents((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const addAgent = () => {
    const n = agents.length + 1;
    setAgents((prev) => [
      ...prev,
      {
        id: `agent_${n}`,
        name: `Agent ${n}`,
        role: 'Specialist',
        provider: 'simulator',
        model: 'synapse-sim-1',
        color: '#a1a1a6',
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parsedCost = Number(maxCostUsd);
      const res = await api.createSession({
        fileName,
        title,
        mode,
        max_turns: maxTurns,
        ...(Number.isFinite(parsedCost) && parsedCost > 0 ? { max_cost_usd: parsedCost } : {}),
        agents,
        initialPrompt,
      });
      await selectSession(res.document.filePath);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo phiên');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
    >
      <div className="glass-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3
            className="text-[16px] font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-head)' }}
          >
            Tạo phòng thảo luận mới
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Tiêu đề phiên</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="glass-input h-9 w-full rounded-xl px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Tên file (.chat.md)</label>
              <input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                required
                className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Chế độ điều phối</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OrchestrationMode)}
                className="glass-input h-9 w-full rounded-xl px-3 text-xs"
              >
                <option value="mention_and_round_robin">@mention ưu tiên + Round-robin</option>
                <option value="mention">Chỉ theo @mention</option>
                <option value="round_robin">Xoay vòng (Round-robin)</option>
                <option value="manual">Thủ công (Manual)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Giới hạn lượt tự chạy</label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value) || 8)}
                className="glass-input h-9 w-full rounded-xl px-3 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
                Ngân sách tối đa (USD, tùy chọn)
              </label>
              <input
                type="number"
                min={0}
                step="0.05"
                value={maxCostUsd}
                onChange={(e) => setMaxCostUsd(e.target.value)}
                placeholder="VD: 0.50 (để trống nếu không giới hạn)"
                className="glass-input h-9 w-full rounded-xl px-3 text-xs tabular-nums"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ink-2)]">
                Danh sách Agents ({agents.length})
              </span>
              <button
                type="button"
                onClick={addAgent}
                className="glass-btn inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                Thêm Agent
              </button>
            </div>
            <div className="space-y-2">
              {agents.map((a, idx) => {
                const isCli = a.provider === 'claude-code' || a.provider === 'gemini-cli';
                return (
                  <div key={idx} className="glass-sub space-y-1.5 rounded-2xl p-2.5">
                    <div className="grid grid-cols-12 items-center gap-2">
                      <input
                        value={a.id}
                        onChange={(e) => updateAgent(idx, { id: e.target.value })}
                        placeholder="id"
                        className="glass-input col-span-2 h-8 rounded-lg px-2 font-mono text-xs"
                      />
                      <input
                        value={a.name}
                        onChange={(e) => updateAgent(idx, { name: e.target.value })}
                        placeholder="Tên"
                        className="glass-input col-span-3 h-8 rounded-lg px-2 text-xs"
                      />
                      <select
                        value={a.provider}
                        onChange={(e) => {
                          const nextProvider = e.target.value as ProviderKind;
                          const cliNext = nextProvider === 'claude-code' || nextProvider === 'gemini-cli';
                          updateAgent(idx, { provider: nextProvider, ...(cliNext ? {} : { worktree: undefined }) });
                        }}
                        className="glass-input col-span-3 h-8 rounded-lg px-2 text-xs"
                      >
                        <option value="simulator">Simulator (Demo)</option>
                        <option value="claude-code">Claude Code CLI</option>
                        <option value="gemini-cli">Gemini CLI</option>
                        <option value="gemini">Google Gemini API</option>
                        <option value="anthropic">Anthropic Claude API</option>
                        <option value="openai">OpenAI API</option>
                        <option value="ollama">Ollama (Local)</option>
                      </select>
                      <input
                        value={a.model}
                        onChange={(e) => updateAgent(idx, { model: e.target.value })}
                        placeholder="model"
                        className="glass-input col-span-3 h-8 rounded-lg px-2 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setAgents((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 flex h-8 items-center justify-center text-[var(--ink-3)] hover:text-[var(--negative)]"
                        aria-label="Xóa agent"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                    {isCli && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 pl-0.5 text-[11px] text-[var(--ink-2)]">
                        <input
                          type="checkbox"
                          checked={Boolean(a.worktree)}
                          onChange={(e) => updateAgent(idx, { worktree: e.target.checked ? true : undefined })}
                          className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                        />
                        <span>
                          Chạy trong Git worktree riêng (
                          <span className="font-mono text-[var(--ink)]">synapse/{a.id || 'agent'}</span>)
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
              Đề bài mở đầu (tùy chọn)
            </label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              rows={3}
              className="glass-input w-full rounded-xl p-3 text-xs"
            />
          </div>

          {error && (
            <p className="text-xs font-medium" style={{ color: 'var(--negative)' }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn h-9 rounded-full px-4 text-xs font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="glass-btn-solid h-9 rounded-full px-5 text-xs font-semibold disabled:opacity-40"
            >
              {submitting ? 'Đang tạo' : 'Tạo phiên'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
