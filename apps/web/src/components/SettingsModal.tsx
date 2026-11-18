import { useEffect, useState } from 'react';
import { Bell, KeyRound, Save, X } from 'lucide-react';
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
  const [notifPerm, setNotifPerm] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (!open) return;
    setSavedOk(false);
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
    void api.getSettings().then(setSettings);
  }, [open]);

  if (!open) return null;

  const handleRequestDesktopNotif = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPerm(result);
  };

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
    >
      <div className="glass-modal w-full max-w-lg rounded-[24px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
            <h3
              className="text-[16px] font-bold text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-head)' }}
            >
              Cấu hình Model Providers
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-[var(--ink-2)]">
          API key chỉ được lưu cục bộ tại <code>~/.synapse/settings.json</code> (không ghi vào repo dự án). Các
          agent dùng <code>simulator</code> có thể chạy ngay không cần key.
        </p>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Google Gemini API Key</label>
            <input
              type="password"
              value={settings.geminiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))}
              placeholder="AIza..."
              className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Anthropic API Key</label>
            <input
              type="password"
              value={settings.anthropicApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
              placeholder="sk-ant-..."
              className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">OpenAI API Key</label>
            <input
              type="password"
              value={settings.openaiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              placeholder="sk-..."
              className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Ollama Base URL</label>
            <input
              value={settings.ollamaBaseUrl ?? 'http://127.0.0.1:11434'}
              onChange={(e) => setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))}
              className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
              ntfy.sh Topic URL (thông báo điện thoại)
            </label>
            <input
              value={settings.ntfyTopicUrl ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, ntfyTopicUrl: e.target.value }))}
              placeholder="https://ntfy.sh/synapse-alerts"
              className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
            />
          </div>
          <div className="glass-sub flex items-center justify-between rounded-xl px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
              <Bell className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.5} />
              <span>Thông báo Desktop ({notifPerm})</span>
            </div>
            {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void handleRequestDesktopNotif()}
                className="glass-btn h-7 rounded-full px-3 text-xs font-medium"
              >
                Bật quyền
              </button>
            )}
          </div>

          {savedOk && (
            <p className="text-xs font-medium" style={{ color: 'var(--positive)' }}>
              Đã lưu cấu hình local
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn h-9 rounded-full px-4 text-xs font-semibold"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={saving}
              className="glass-btn-solid inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-xs font-semibold disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.6} />
              {saving ? 'Đang lưu' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
