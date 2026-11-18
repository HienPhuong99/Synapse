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
    <div className="flex h-full w-1/2 flex-col border-l border-[rgba(237,237,237,0.08)] bg-[#0f0f10]">
      <div className="flex h-11 items-center justify-between border-b border-[rgba(237,237,237,0.08)] px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#ededed]">{activeDoc.filePath}</span>
          {dirty ? (
            <span className="text-xs text-[#e5a04d]">Chưa lưu</span>
          ) : (
            <span className="text-xs text-[#4cc38a]">
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
              className="h-7 rounded-md px-2 text-xs text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]"
            >
              Hoàn tác
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#ededed] px-2.5 text-xs font-medium text-[#141415] transition-colors duration-150 hover:bg-white disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            {saving ? 'Đang lưu' : 'Lưu file'}
          </button>
        </div>
      </div>
      {saveError && (
        <div className="border-b border-[#e5484d]/30 bg-[#e5484d]/10 px-4 py-2 text-xs text-[#e5484d]">
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
        className="flex-1 resize-none bg-[#0f0f10] p-4 font-mono text-xs leading-relaxed text-[#ededed] focus:outline-none"
      />
    </div>
  );
}
