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
    color: '#6366f1',
    system_prompt: 'Đề xuất kiến trúc rõ ràng, cân nhắc trade-off và khả năng mở rộng.',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Code & Security Reviewer',
    provider: 'simulator',
    model: 'synapse-sim-1',
    color: '#f59e0b',
    system_prompt: 'Phản biện edge-case, race condition, bảo mật và tính đơn giản.',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    role: 'UI/UX Engineer',
    provider: 'simulator',
    model: 'synapse-sim-1',
    color: '#10b981',
    system_prompt: 'Thiết kế trải nghiệm người dùng, streaming UI và quản lý state.',
  },
];

export function NewSessionModal({ open, onClose }: NewSessionModalProps) {
  const selectSession = useSynapseStore((s) => s.selectSession);
  const [title, setTitle] = useState('Thảo luận kiến trúc mới');
  const [fileName, setFileName] = useState(`session-${Date.now().toString().slice(-4)}.chat.md`);
  const [mode, setMode] = useState<OrchestrationMode>('mention_and_round_robin');
  const [maxTurns, setMaxTurns] = useState(8);
  const [initialPrompt, setInitialPrompt] = useState(
    'Chúng ta cần thiết kế tính năng mới cho dự án. @architect hãy đề xuất phương án trước nhé.'
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
        color: '#06b6d4',
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createSession({
        fileName,
        title,
        mode,
        max_turns: maxTurns,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">Tạo phòng thảo luận .chat.md mới</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Tiêu đề phiên</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Tên file (.chat.md)</label>
              <input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Chế độ điều phối</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OrchestrationMode)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="mention_and_round_robin">@mention ưu tiên + Round-robin</option>
                <option value="mention">Chỉ theo @mention</option>
                <option value="round_robin">Xoay vòng (Round-robin)</option>
                <option value="manual">Thủ công (Manual)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Giới hạn lượt tự chạy (max_turns)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value) || 8)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Danh sách AI Agents ({agents.length})</span>
              <button
                type="button"
                onClick={addAgent}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="h-3 w-3" />
                Thêm Agent
              </button>
            </div>
            <div className="space-y-2">
              {agents.map((a, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2"
                >
                  <input
                    value={a.id}
                    onChange={(e) => updateAgent(idx, { id: e.target.value })}
                    placeholder="id"
                    className="col-span-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
                  />
                  <input
                    value={a.name}
                    onChange={(e) => updateAgent(idx, { name: e.target.value })}
                    placeholder="Tên"
                    className="col-span-3 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  />
                  <select
                    value={a.provider}
                    onChange={(e) => updateAgent(idx, { provider: e.target.value as ProviderKind })}
                    className="col-span-3 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  >
                    <option value="simulator">Simulator (Demo)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama (Local)</option>
                  </select>
                  <input
                    value={a.model}
                    onChange={(e) => updateAgent(idx, { model: e.target.value })}
                    placeholder="model"
                    className="col-span-3 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setAgents((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 flex justify-center text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Đề bài mở đầu (tùy chọn)</label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {submitting ? 'Đang tạo...' : 'Tạo .chat.md'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
