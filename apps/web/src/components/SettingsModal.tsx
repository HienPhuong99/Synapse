import { useEffect, useState } from 'react';
import { KeyRound, Save, X } from 'lucide-react';
import type { ProviderSettings } from '@synapse/shared';
import { api } from '../lib/api.ts';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<ProviderSettings>({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSavedOk(false);
    void api.getSettings().then(setSettings);
  }, [open]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.saveSettings(settings);
      setSettings(updated);
      setSavedOk(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-400" />
            <h3 className="text-base font-semibold text-zinc-100">Cấu hình Model Providers (Local)</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-zinc-400">
          API key chỉ được lưu cục bộ trong <code>~/.synapse/settings.json</code> (không ghi vào repo dự án). Các agent
          dùng provider <code>simulator</code> có thể chạy ngay không cần key.
        </p>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Google Gemini API Key</label>
            <input
              type="password"
              value={settings.geminiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))}
              placeholder="AIza..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Anthropic API Key</label>
            <input
              type="password"
              value={settings.anthropicApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">OpenAI API Key</label>
            <input
              type="password"
              value={settings.openaiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Ollama Base URL (Local)</label>
            <input
              value={settings.ollamaBaseUrl ?? 'http://127.0.0.1:11434'}
              onChange={(e) => setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {savedOk && <p className="text-xs text-emerald-400">Đã lưu cấu hình local.</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
