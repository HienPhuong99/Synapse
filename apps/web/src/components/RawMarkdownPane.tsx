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
    <div className="flex h-full w-1/2 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-zinc-200">{activeDoc.filePath}</span>
          {dirty ? (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              Chưa lưu
            </span>
          ) : (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              Đã đồng bộ ({lastSyncSource === 'watcher' ? 'file watcher' : 'synced'})
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
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Hoàn tác
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Đang lưu...' : 'Lưu .chat.md'}
          </button>
        </div>
      </div>
      {saveError && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
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
        className="flex-1 resize-none bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 focus:outline-none"
      />
    </div>
  );
}
