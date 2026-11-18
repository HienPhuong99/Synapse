import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendMessageRaw,
  extractFileRefs,
  extractMentions,
  nextMessageId,
  replaceMessageRaw,
  serializeChatMd,
  setStatusRaw,
  truncateMessagesRaw,
  type AgentConfig,
  type ChatDocument,
  type ChatMessage,
  type ProviderSettings,
  type WsServerEvent,
} from '@synapse/shared';
import { runAgentProvider } from '../providers/index.js';
import type { PresenceStore } from '../presence/store.js';
import type { WorkspaceSync } from '../sync/watcher.js';
import { readSafeWorkspaceFile } from './context.js';

interface ActiveRun {
  controller: AbortController;
  turnCount: number;
  looping: boolean;
  /** Settles (never rejects) once the run has fully cleaned up. */
  done?: Promise<void>;
}

const noop = () => undefined;

const COUNCIL_ANSWER =
  '[Hội đồng — bước 1] Trả lời ĐỘC LẬP vấn đề trong các tin nhắn trên: cụ thể, đúng, làm được. Chỉ phân tích, KHÔNG sửa file.';
const COUNCIL_REVIEW =
  '[Hội đồng — bước 2] Dưới đây là các câu trả lời ẩn danh cho vấn đề trên. Nhận xét ngắn điểm mạnh/yếu từng câu ' +
  '(độ đúng, cụ thể, làm được; KHÔNG ưu tiên câu dài). Chỉ phân tích, KHÔNG sửa file. ' +
  'Dòng cuối cùng PHẢI đúng dạng: `XẾP HẠNG: B > A > C` (tốt nhất trước).';
const COUNCIL_CHAIR =
  '[Hội đồng — chủ toạ] Bạn là chủ toạ. Dưới đây là các câu trả lời (đã lộ tên) kèm hạng trung bình từ chấm chéo. ' +
  'Viết câu trả lời CUỐI CÙNG tốt nhất cho vấn đề trên: giữ ý đúng, sửa chỗ sai, nêu bất đồng nếu còn. ' +
  'Có đúng một dòng "Chốt: ...". Chỉ phân tích, KHÔNG sửa file.';
const RANK_LINE = /XẾP HẠNG\s*[:：]\s*[A-Z](?:\s*>\s*[A-Z])*/giu;

function withCouncilPrompt(doc: ChatDocument, content: string): ChatDocument {
  const msg: ChatMessage = { id: 'council', author: 'human', timestamp: '', content, mentions: [], fileRefs: [] };
  return { ...doc, messages: [...doc.messages, msg] };
}

/** Embedded answers must not contain lines the chat.md parser would read as new message headings. */
function demoteHeadings(text: string): string {
  return text.replace(/^#{1,3}(?=\s)/gm, '####');
}

export function parseRanking(text: string, labels: string[]): string[] | null {
  const last = [...text.matchAll(RANK_LINE)].pop();
  if (!last) return null;
  const order = last[0].replace(/^[^:：]*[:：]/, '').split('>').map((s) => s.trim().toUpperCase());
  return [...new Set(order.filter((l) => labels.includes(l)))];
}

/** Average 1-based position per label over the ballots that ranked it. */
export function aggregateRanking(ballots: (string[] | null)[], labels: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const label of labels) {
    const pos = ballots.flatMap((b) => (b && b.includes(label) ? [b.indexOf(label) + 1] : []));
    if (pos.length) out.set(label, pos.reduce((a, b) => a + b, 0) / pos.length);
  }
  return out;
}

export class ConversationOrchestrator {
  private activeRuns = new Map<string, ActiveRun>();
  private settings: ProviderSettings = {};
  private readonly settingsPath: string;

  constructor(
    private readonly sync: WorkspaceSync,
    private readonly emitEvent: (event: WsServerEvent) => void,
    private readonly presence?: PresenceStore
  ) {
    this.settingsPath = path.join(os.homedir(), '.synapse', 'settings.json');
  }

  stopAll(): void {
    for (const run of this.activeRuns.values()) {
      run.controller.abort();
    }
    this.activeRuns.clear();
  }

  async loadSettings(): Promise<ProviderSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      this.settings = JSON.parse(raw) as ProviderSettings;
    } catch {
      this.settings = {};
    }
    return this.getMaskedSettings();
  }

  getMaskedSettings(): ProviderSettings {
    return {
      geminiApiKey: this.settings.geminiApiKey ? '••••••••' + this.settings.geminiApiKey.slice(-4) : '',
      anthropicApiKey: this.settings.anthropicApiKey ? '••••••••' + this.settings.anthropicApiKey.slice(-4) : '',
      openaiApiKey: this.settings.openaiApiKey ? '••••••••' + this.settings.openaiApiKey.slice(-4) : '',
      openaiBaseUrl: this.settings.openaiBaseUrl || '',
      ollamaBaseUrl: this.settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
    };
  }

  async saveSettings(next: ProviderSettings): Promise<ProviderSettings> {
    const updated: ProviderSettings = { ...this.settings };
    if (next.geminiApiKey !== undefined && !next.geminiApiKey.startsWith('••••')) {
      updated.geminiApiKey = next.geminiApiKey.trim();
    }
    if (next.anthropicApiKey !== undefined && !next.anthropicApiKey.startsWith('••••')) {
      updated.anthropicApiKey = next.anthropicApiKey.trim();
    }
    if (next.openaiApiKey !== undefined && !next.openaiApiKey.startsWith('••••')) {
      updated.openaiApiKey = next.openaiApiKey.trim();
    }
    if (next.openaiBaseUrl !== undefined) updated.openaiBaseUrl = next.openaiBaseUrl.trim();
    if (next.ollamaBaseUrl !== undefined) updated.ollamaBaseUrl = next.ollamaBaseUrl.trim();

    this.settings = updated;
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(updated, null, 2), 'utf8');
    return this.getMaskedSettings();
  }

  /** Fire-and-forget a run without letting a rejection kill the process; report it to the UI instead. */
  runInBackground(filePath: string, task: Promise<unknown>): void {
    task.catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[${filePath}]`, reason);
      this.emitEvent({ type: 'orchestrator:status', filePath, ...this.getStatus(filePath), reason });
    });
  }

  isRunning(filePath: string): boolean {
    return this.activeRuns.has(filePath);
  }

  getStatus(filePath: string): { running: boolean; turnCount: number } {
    const run = this.activeRuns.get(filePath);
    return { running: Boolean(run), turnCount: run?.turnCount ?? 0 };
  }

  pickNextAgent(doc: ChatDocument, forcedAgentId?: string): AgentConfig | null {
    const agents = doc.meta.agents;
    if (agents.length === 0) return null;

    if (forcedAgentId) {
      return agents.find((a) => a.id === forcedAgentId) ?? null;
    }

    const lastMsg = doc.messages[doc.messages.length - 1];
    const mode = doc.meta.mode || 'mention_and_round_robin';

    if (lastMsg && (mode === 'mention' || mode === 'mention_and_round_robin')) {
      for (const mention of lastMsg.mentions) {
        const matched = agents.find((a) => a.id.toLowerCase() === mention.toLowerCase() && a.id !== lastMsg.author);
        if (matched) return matched;
      }
      if (mode === 'mention') return null;
    }

    if (mode === 'manual') return null;

    // Round-robin fallback
    if (!lastMsg) return agents[0];
    const currentIdx = agents.findIndex((a) => a.id === lastMsg.author);
    if (currentIdx === -1) return agents[0];
    return agents[(currentIdx + 1) % agents.length];
  }

  async runStep(filePath: string, forcedAgentId?: string): Promise<void> {
    if (this.activeRuns.has(filePath)) {
      throw new Error('Phiên thảo luận này đang chạy một lượt AI khác.');
    }

    const doc = this.sync.getDocument(filePath);
    if (!doc) throw new Error(`Không tìm thấy file: ${filePath}`);

    const agent = this.pickNextAgent(doc, forcedAgentId);
    if (!agent) {
      throw new Error('Không xác định được Agent tiếp theo (kiểm tra danh sách agents hoặc chế độ điều phối).');
    }

    const controller = new AbortController();
    const run: ActiveRun = { controller, turnCount: 1, looping: false };
    this.activeRuns.set(filePath, run);
    this.emitEvent({ type: 'orchestrator:status', filePath, running: true, turnCount: 1 });

    const turn = this.executeTurn(filePath, agent, controller.signal).finally(() => {
      this.activeRuns.delete(filePath);
      this.emitEvent({ type: 'orchestrator:status', filePath, running: false, turnCount: 0 });
    });
    run.done = turn.then(noop, noop);
    return turn;
  }

  async startLoop(filePath: string): Promise<void> {
    if (this.activeRuns.has(filePath)) return;

    const doc = this.sync.getDocument(filePath);
    if (!doc) throw new Error(`Không tìm thấy file: ${filePath}`);
    if (doc.meta.agents.length === 0) {
      throw new Error('Phiên chưa có Agent nào được cấu hình.');
    }

    const controller = new AbortController();
    const runState: ActiveRun = { controller, turnCount: 0, looping: true };
    this.activeRuns.set(filePath, runState);
    this.emitEvent({ type: 'orchestrator:status', filePath, running: true, turnCount: 0 });

    runState.done = (async () => {
      let reason = 'completed';
      try {
        await this.sync.patchRaw(filePath, (raw) => setStatusRaw(raw, 'running'));
        while (!controller.signal.aborted) {
          const latest = this.sync.getDocument(filePath);
          if (!latest) {
            reason = 'missing_document';
            break;
          }

          const maxTurns = latest.meta.max_turns || 12;
          if (runState.turnCount >= maxTurns) {
            reason = `Đã chạm giới hạn ${maxTurns} lượt (max_turns).`;
            break;
          }

          const nextAgent = this.pickNextAgent(latest);
          if (!nextAgent) {
            reason = 'Không có agent kế tiếp được chỉ định.';
            break;
          }

          runState.turnCount += 1;
          this.emitEvent({
            type: 'orchestrator:status',
            filePath,
            running: true,
            turnCount: runState.turnCount,
          });

          await this.executeTurn(filePath, nextAgent, controller.signal);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          reason = 'Đã tạm dừng bởi người dùng.';
        } else {
          reason = err instanceof Error ? err.message : String(err);
        }
      } finally {
        const finalTurnCount = runState.turnCount;
        this.activeRuns.delete(filePath);
        await this.sync
          .patchRaw(filePath, (raw) => setStatusRaw(raw, controller.signal.aborted ? 'paused' : 'idle'))
          .catch(noop);
        this.emitEvent({
          type: 'orchestrator:status',
          filePath,
          running: false,
          turnCount: finalTurnCount,
          reason,
        });
      }
    })();
  }

  async pause(filePath: string): Promise<void> {
    const run = this.activeRuns.get(filePath);
    if (run) {
      run.controller.abort();
    }
    const doc = this.sync.getDocument(filePath);
    if (doc && doc.meta.status === 'running') {
      await this.sync.patchRaw(filePath, (raw) => setStatusRaw(raw, 'paused'));
    }
  }

  /**
   * Council (after karpathy/llm-council): every agent answers the latest message in parallel, then ranks
   * the anonymized answers, then the chairman synthesizes. Only the chairman's turn is written to the file;
   * the answers and rankings go into its collapsed thinking block.
   */
  async runCouncil(filePath: string, chairmanId?: string): Promise<void> {
    if (this.activeRuns.has(filePath)) throw new Error('Phiên thảo luận này đang chạy một lượt AI khác.');
    const doc = this.sync.getDocument(filePath);
    if (!doc) throw new Error(`Không tìm thấy file: ${filePath}`);
    const agents = doc.meta.agents;
    if (agents.length < 2) throw new Error('Hội đồng cần ít nhất 2 agent.');
    const chairman = agents.find((a) => a.id === chairmanId) ?? agents[0];

    const controller = new AbortController();
    const run: ActiveRun = { controller, turnCount: 1, looping: false };
    this.activeRuns.set(filePath, run);
    this.emitEvent({ type: 'orchestrator:status', filePath, running: true, turnCount: 1 });

    const task = (async () => {
      const signal = controller.signal;
      const answers = await this.askAll(filePath, agents, doc, COUNCIL_ANSWER, signal);
      const ok = answers.filter((a) => a.text);
      if (ok.length === 0) throw new Error(`Hội đồng: không agent nào trả lời được (${answers.map((a) => a.error).join('; ')})`);
      const labels = ok.map((_, i) => String.fromCharCode(65 + i));

      let ranks: Map<string, number> = new Map();
      let reviews: { agent: AgentConfig; text?: string; error?: string }[] = [];
      if (ok.length > 1) {
        const ballot = ok.map((a, i) => `#### Câu trả lời ${labels[i]}\n\n${demoteHeadings(a.text!)}`).join('\n\n');
        reviews = await this.askAll(filePath, agents, doc, `${COUNCIL_REVIEW}\n\n${ballot}`, signal);
        ranks = aggregateRanking(reviews.map((r) => parseRanking(r.text ?? '', labels)), labels);
      }

      const rankOf = (i: number) => (ranks.has(labels[i]) ? ` — hạng TB ${ranks.get(labels[i])!.toFixed(1)}` : '');
      const revealed = ok.map((a, i) => `#### ${labels[i]} (@${a.agent.id})${rankOf(i)}\n\n${demoteHeadings(a.text!)}`).join('\n\n');
      const log = [
        `**Hội đồng** — ${ok.length}/${agents.length} thành viên trả lời, chủ toạ @${chairman.id}.`,
        revealed,
        reviews.length ? `#### Chấm chéo\n\n${reviews.map((r) => `- @${r.agent.id}: ${r.text ? (r.text.match(RANK_LINE)?.[0] ?? 'không ghi dòng XẾP HẠNG') : `lỗi: ${r.error}`}`).join('\n')}` : '',
        ...answers.filter((a) => a.error).map((a) => `- @${a.agent.id} không trả lời được: ${a.error}`),
      ].filter(Boolean).join('\n\n');

      const synth = withCouncilPrompt(doc, `${COUNCIL_CHAIR}\n\n${revealed}`);
      await this.executeTurn(filePath, chairman, signal, { document: synth, thinkingPrefix: log });
    })().finally(() => {
      this.activeRuns.delete(filePath);
      this.emitEvent({ type: 'orchestrator:status', filePath, running: false, turnCount: 0 });
    });
    run.done = task.then(noop, noop);
    return task;
  }

  /** One non-persisted answer per agent, in parallel; failures are reported, not thrown (unless aborted). */
  private async askAll(filePath: string, agents: AgentConfig[], doc: ChatDocument, prompt: string, signal: AbortSignal) {
    const document = withCouncilPrompt(doc, prompt);
    const results = await Promise.allSettled(
      agents.map(async (agent) => {
        this.presence?.ingest({ agent: agent.id, source: 'api', event: 'thinking', detail: 'Hội đồng' }, [doc]);
        this.emitEvent({ type: 'agent:state', filePath, agentId: agent.id, state: 'thinking', detail: 'Hội đồng' });
        try {
          const r = await runAgentProvider(
            { agent, document, fileExcerpts: [], settings: this.settings, signal, cwd: this.sync.workspaceRoot },
            { onThinkingDelta: noop, onContentDelta: noop }
          );
          return r.content.trim();
        } finally {
          this.emitEvent({ type: 'agent:state', filePath, agentId: agent.id, state: 'idle' });
          this.presence?.ingest({ agent: agent.id, source: 'api', event: 'idle' }, [doc]);
        }
      })
    );
    if (signal.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    return results.map((r, i) =>
      r.status === 'fulfilled' && r.value
        ? { agent: agents[i], text: r.value }
        : { agent: agents[i], error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : 'trả lời rỗng' }
    );
  }

  private async executeTurn(
    filePath: string,
    agent: AgentConfig,
    signal: AbortSignal,
    override?: { document: ChatDocument; thinkingPrefix?: string }
  ): Promise<void> {
    const doc = this.sync.getDocument(filePath);
    if (!doc) return;
    const promptDoc = override?.document ?? doc;

    const messageId = nextMessageId(doc.messages);
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Gather @file references from recent messages
    const refPaths = Array.from(
      new Set(doc.messages.slice(-6).flatMap((m) => m.fileRefs))
    ).slice(0, 5);

    const fileExcerpts: { path: string; content: string }[] = [];
    for (const ref of refPaths) {
      try {
        const loaded = await readSafeWorkspaceFile(this.sync.workspaceRoot, ref, 10000);
        fileExcerpts.push({ path: loaded.path, content: loaded.content });
      } catch {
        // Ignore missing/inaccessible files
      }
    }

    this.presence?.markSeen(agent.id, doc);
    this.presence?.ingest({ agent: agent.id, source: 'api', event: 'thinking' }, [doc]);
    this.emitEvent({ type: 'agent:state', filePath, agentId: agent.id, state: 'thinking' });
    this.emitEvent({
      type: 'stream:start',
      stream: {
        filePath,
        messageId,
        author: agent.id,
        model: agent.model,
        provider: agent.provider,
        thinking: '',
        content: '',
        startedAt,
      },
    });

    let streamedThinking = '';
    let streamedContent = '';

    try {
      const result = await runAgentProvider(
        {
          agent,
          document: promptDoc,
          fileExcerpts,
          settings: this.settings,
          signal,
          cwd: this.sync.workspaceRoot,
        },
        {
          onActivity: (a) =>
            this.presence?.ingest({ agent: agent.id, source: 'cli', event: 'PreToolUse', ...a }, [doc]),
          onThinkingDelta: (delta) => {
            streamedThinking += delta;
            this.emitEvent({ type: 'stream:delta', filePath, messageId, deltaThinking: delta });
          },
          onContentDelta: (delta) => {
            if (streamedContent.length === 0) {
              this.presence?.ingest({ agent: agent.id, source: 'api', event: 'typing' }, [doc]);
              this.emitEvent({ type: 'agent:state', filePath, agentId: agent.id, state: 'streaming' });
            }
            streamedContent += delta;
            this.emitEvent({ type: 'stream:delta', filePath, messageId, deltaContent: delta });
          },
        }
      );

      const finalContent = result.content.trim() || streamedContent.trim();
      const finalThinking =
        [override?.thinkingPrefix, result.thinking.trim() || streamedThinking.trim()].filter(Boolean).join('\n\n') ||
        undefined;
      const durationMs = Date.now() - startMs;

      await this.sync.patchRaw(filePath, (raw, latest) => {
        const msgId = nextMessageId(latest.messages);
        const newMessage: ChatMessage = {
          id: msgId,
          author: agent.id,
          timestamp: new Date().toISOString(),
          thinking: finalThinking,
          content: finalContent,
          meta: {
            id: msgId,
            model: agent.model,
            provider: agent.provider,
            status: 'done',
            tokens_in: result.tokensIn,
            tokens_out: result.tokensOut,
            duration_ms: durationMs,
            refs: fileExcerpts.map((f) => f.path),
          },
          mentions: extractMentions(finalContent),
          fileRefs: Array.from(new Set([...fileExcerpts.map((f) => f.path), ...extractFileRefs(finalContent)])),
        };
        return appendMessageRaw(raw, newMessage);
      });

      this.emitEvent({ type: 'stream:end', filePath, messageId, status: 'done' });
      this.emitEvent({ type: 'agent:state', filePath, agentId: agent.id, state: 'idle' });
      this.presence?.ingest({ agent: agent.id, source: 'api', event: 'idle' }, this.sync.getAllDocuments());
    } catch (err) {
      const aborted = signal.aborted || (err instanceof Error && err.name === 'AbortError');
      const errMsg = err instanceof Error ? err.message : String(err);

      if (aborted && streamedContent.trim().length > 0) {
        await this.sync.patchRaw(filePath, (raw, latest) => {
          const msgId = nextMessageId(latest.messages);
          const partialMsg: ChatMessage = {
            id: msgId,
            author: agent.id,
            timestamp: new Date().toISOString(),
            thinking: streamedThinking.trim() || undefined,
            content: streamedContent.trim(),
            meta: {
              id: msgId,
              model: agent.model,
              provider: agent.provider,
              status: 'stopped',
              duration_ms: Date.now() - startMs,
            },
            mentions: extractMentions(streamedContent),
            fileRefs: extractFileRefs(streamedContent),
          };
          return appendMessageRaw(raw, partialMsg);
        });
      }

      this.emitEvent({
        type: 'stream:end',
        filePath,
        messageId,
        status: aborted ? 'stopped' : 'error',
        error: aborted ? undefined : errMsg,
      });
      this.emitEvent({
        type: 'agent:state',
        filePath,
        agentId: agent.id,
        state: aborted ? 'idle' : 'error',
        detail: aborted ? undefined : errMsg,
      });
      this.presence?.ingest(
        { agent: agent.id, source: 'api', event: aborted ? 'idle' : 'error', detail: aborted ? undefined : errMsg },
        this.sync.getAllDocuments()
      );

      if (!aborted) {
        throw err;
      }
    }
  }

  async postHumanMessage(filePath: string, content: string, author = 'human', autoRun = false): Promise<ChatDocument> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Nội dung tin nhắn không được để trống.');

    const updated = await this.sync.patchRaw(filePath, (raw, latest) => {
      const msgId = nextMessageId(latest.messages);
      return appendMessageRaw(raw, {
        id: msgId,
        author,
        timestamp: new Date().toISOString(),
        content: trimmed,
        mentions: extractMentions(trimmed),
        fileRefs: extractFileRefs(trimmed),
      });
    });

    if (autoRun && !this.activeRuns.has(filePath)) {
      this.runInBackground(filePath, this.startLoop(filePath));
    }

    return updated;
  }

  async editMessage(filePath: string, messageId: string, content: string): Promise<ChatDocument> {
    return this.sync.patchRaw(filePath, (raw, latest) => {
      const old = latest.messages.find((m) => m.id === messageId);
      if (!old) throw new Error(`Không tìm thấy tin nhắn ${messageId}`);
      return replaceMessageRaw(raw, messageId, { ...old, content: content.trim() });
    });
  }

  async branchFromMessage(filePath: string, messageId: string): Promise<ChatDocument> {
    const source = this.sync.getDocument(filePath);
    if (!source) throw new Error(`Không tìm thấy file: ${filePath}`);

    const idx = source.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) throw new Error(`Không tìm thấy tin nhắn ${messageId}`);

    const dir = path.posix.dirname(filePath);
    const rawBase = path.posix.basename(filePath);
    const base = rawBase
      .replace(/\.chat\.md$/i, '')
      .replace(/\.md$/i, '')
      .replace(/\.branch-\d+$/, '');
    let branchNum = 1;
    let candidate = dir === '.' ? `${base}.branch-${branchNum}.chat.md` : `${dir}/${base}.branch-${branchNum}.chat.md`;
    while (this.sync.getDocument(candidate)) {
      branchNum += 1;
      candidate = dir === '.' ? `${base}.branch-${branchNum}.chat.md` : `${dir}/${base}.branch-${branchNum}.chat.md`;
    }

    const branchedDoc: ChatDocument = {
      filePath: candidate,
      raw: '',
      meta: {
        ...source.meta,
        schema: 'synapse/v1',
        title: `${source.meta.title} (Branch #${branchNum})`,
        status: 'idle',
      },
      preamble: source.preamble,
      messages: source.messages.slice(0, idx + 1),
    };

    return this.sync.writeRaw(candidate, serializeChatMd(branchedDoc));
  }

  async rerunFromMessage(filePath: string, messageId: string): Promise<ChatDocument> {
    const run = this.activeRuns.get(filePath);
    if (run) {
      await this.pause(filePath);
      await run.done; // wait for cleanup, otherwise runStep below sees the old run
    }

    let targetAgentId: string | undefined;
    const updated = await this.sync.patchRaw(filePath, (raw, latest) => {
      const targetMsg = latest.messages.find((m) => m.id === messageId);
      if (!targetMsg) throw new Error(`Không tìm thấy tin nhắn ${messageId}`);
      const isAgentMsg = latest.meta.agents.some((a) => a.id === targetMsg.author);
      if (isAgentMsg) targetAgentId = targetMsg.author;
      return truncateMessagesRaw(raw, messageId, !isAgentMsg);
    });

    this.runInBackground(filePath, this.runStep(filePath, targetAgentId));
    return updated;
  }
}
