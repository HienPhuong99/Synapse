import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function RawMarkdownPane() {
  const activeDoc = useSynapseStore((s) => s.activeDoc);
  const lastSyncSource = useSynapseStore((s) => s.lastSyncSource);
  const [rawDraft, setRawDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (activeDoc && !dirty) {
      setRawDraft(activeDoc.raw);
    }
  }, [activeDoc, dirty]);

  useEffect(() => {
    setDirty(false);
    setSaveError(null);
    if (activeDoc) {
      setRawDraft(activeDoc.raw);
    }
  }, [activeDoc?.filePath]);

  if (!activeDoc) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveRaw(activeDoc.filePath, rawDraft);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lỗi lưu file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass flex h-full w-1/2 flex-col overflow-hidden rounded-[22px]">
      <div className="flex h-11 items-center justify-between border-b border-[var(--line-soft)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-[var(--ink)]">{activeDoc.filePath}</span>
          {dirty ? (
            <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--warning)' }}>
              Chưa lưu
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--positive)' }}>
              {lastSyncSource === 'watcher' ? 'Đồng bộ từ ổ đĩa' : 'Đã đồng bộ'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setRawDraft(activeDoc.raw);
                setDirty(false);
              }}
              className="h-7 rounded-lg px-2 text-xs text-[var(--ink-2)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
            >
              Hoàn tác
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="glass-btn-solid inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={1.6} />
            {saving ? 'Đang lưu' : 'Lưu file'}
          </button>
        </div>
      </div>
      {saveError && (
        <div
          className="border-b px-4 py-2 text-xs"
          style={{
            borderColor: 'color-mix(in oklch, var(--negative) 30%, transparent)',
            backgroundColor: 'var(--negative-soft)',
            color: 'var(--negative)',
          }}
        >
          {saveError}
        </div>
      )}
      <textarea
        value={rawDraft}
        onChange={(e) => {
          setRawDraft(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        className="flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-[var(--ink)] focus:outline-none"
      />
    </div>
  );
}
