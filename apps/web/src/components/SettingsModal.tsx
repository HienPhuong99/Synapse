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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[rgba(237,237,237,0.12)] bg-[#141415] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#ededed]">Cấu hình Model Providers</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-[#a1a1a6]">
          API key chỉ được lưu cục bộ tại <code>~/.synapse/settings.json</code> (không ghi vào repo dự án). Các
          agent dùng <code>simulator</code> có thể chạy ngay không cần key.
        </p>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-[#a1a1a6]">Google Gemini API Key</label>
            <input
              type="password"
              value={settings.geminiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))}
              placeholder="AIza..."
              className="h-9 w-full rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#a1a1a6]">Anthropic API Key</label>
            <input
              type="password"
              value={settings.anthropicApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
              placeholder="sk-ant-..."
              className="h-9 w-full rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#a1a1a6]">OpenAI API Key</label>
            <input
              type="password"
              value={settings.openaiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              placeholder="sk-..."
              className="h-9 w-full rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#a1a1a6]">Ollama Base URL</label>
            <input
              value={settings.ollamaBaseUrl ?? 'http://127.0.0.1:11434'}
              onChange={(e) => setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))}
              className="h-9 w-full rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
            />
          </div>

          {savedOk && <p className="text-xs text-[#4cc38a]">Đã lưu cấu hình local</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-4 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#141415] hover:bg-white disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
              {saving ? 'Đang lưu' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
