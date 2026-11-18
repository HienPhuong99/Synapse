import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import {
  extractInsights,
  isChatMdFilename,
  parseChatMd,
  type ChatDocument,
  type InsightsSummary,
  type SessionListItem,
} from '@synapse/shared';
import { WriteQueue } from './writeQueue.js';

export interface SyncEvents {
  updated: (payload: { document: ChatDocument; insights: InsightsSummary; source: 'watcher' | 'server' }) => void;
  removed: (filePath: string) => void;
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.synapse', '.next', 'build']);

export class WorkspaceSync extends EventEmitter {
  readonly workspaceRoot: string;
  readonly writeQueue = new WriteQueue();
  private docs = new Map<string, { doc: ChatDocument; updatedAt: string }>();
  private watcher: FSWatcher | null = null;

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  resolveSafe(relPath: string): string {
    const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.workspaceRoot, cleanRel);
    const rootWithSep = this.workspaceRoot.endsWith(path.sep)
      ? this.workspaceRoot
      : `${this.workspaceRoot}${path.sep}`;
    if (resolved !== this.workspaceRoot && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Path escapes workspace root: ${relPath}`);
    }
    return resolved;
  }

  toRelative(absPath: string): string {
    return path.relative(this.workspaceRoot, absPath).replace(/\\/g, '/');
  }

  async start(): Promise<void> {
    await this.scanInitial();

    this.watcher = chokidar.watch(this.workspaceRoot, {
      ignored: (targetPath: string) => {
        const rel = path.relative(this.workspaceRoot, targetPath);
        if (!rel || rel === '.') return false;
        const segments = rel.split(path.sep);
        if (segments.some((s) => IGNORED_DIRS.has(s))) return true;
        if (path.basename(targetPath).includes('.synapse-tmp-')) return true;
        return false;
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 80,
        pollInterval: 25,
      },
    });

    this.watcher.on('add', (absPath) => {
      if (isChatMdFilename(absPath)) {
        void this.handleExternalChange(absPath);
      }
    });

    this.watcher.on('change', (absPath) => {
      if (isChatMdFilename(absPath)) {
        void this.handleExternalChange(absPath);
      }
    });

    this.watcher.on('unlink', (absPath) => {
      if (isChatMdFilename(absPath)) {
        const rel = this.toRelative(absPath);
        if (this.docs.delete(rel)) {
          this.emit('removed', rel);
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async scanInitial(): Promise<void> {
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && isChatMdFilename(entry.name)) {
          found.push(full);
        }
      }
    };

    await walk(this.workspaceRoot);
    for (const absPath of found) {
      await this.loadFromDisk(absPath, false);
    }
  }

  private async handleExternalChange(absPath: string): Promise<void> {
    try {
      const raw = await fs.readFile(absPath, 'utf8');
      if (this.writeQueue.isSelfEcho(absPath, raw)) {
        return;
      }
      await this.storeParsed(absPath, raw, 'watcher', true);
    } catch {
      // File might be mid-rename or deleted; ignore transient error
    }
  }

  private async loadFromDisk(absPath: string, emitEvent: boolean): Promise<ChatDocument | null> {
    try {
      const raw = await fs.readFile(absPath, 'utf8');
      return await this.storeParsed(absPath, raw, 'watcher', emitEvent);
    } catch {
      return null;
    }
  }

  private async storeParsed(
    absPath: string,
    raw: string,
    source: 'watcher' | 'server',
    emitEvent: boolean
  ): Promise<ChatDocument> {
    const rel = this.toRelative(absPath);
    const stat = await fs.stat(absPath).catch(() => null);
    const updatedAt = stat ? stat.mtime.toISOString() : new Date().toISOString();
    const doc = parseChatMd(raw, rel);
    this.docs.set(rel, { doc, updatedAt });

    if (emitEvent) {
      this.emit('updated', {
        document: doc,
        insights: extractInsights(doc),
        source,
      });
    }
    return doc;
  }

  listSessions(): SessionListItem[] {
    const list: SessionListItem[] = [];
    for (const [filePath, entry] of this.docs.entries()) {
      list.push({
        filePath,
        title: entry.doc.meta.title,
        status: entry.doc.meta.status,
        mode: entry.doc.meta.mode,
        messageCount: entry.doc.messages.length,
        agentCount: entry.doc.meta.agents.length,
        updatedAt: entry.updatedAt,
      });
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getDocument(relPath: string): ChatDocument | null {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return this.docs.get(normalized)?.doc ?? null;
  }

  async writeRaw(relPath: string, rawContent: string): Promise<ChatDocument> {
    const absPath = this.resolveSafe(relPath);
    if (!isChatMdFilename(absPath)) {
      throw new Error('File must be chat.md or end with .chat.md');
    }
    return this.writeQueue.enqueue(absPath, async () => {
      await this.writeQueue.writeAtomic(absPath, rawContent);
      return this.storeParsed(absPath, rawContent, 'server', true);
    });
  }

  /**
   * Re-reads the file inside the per-file queue and applies a raw-text patch
   * (see appendMessageRaw & co. in @synapse/shared). Never re-serializes the whole file.
   */
  async patchRaw(
    relPath: string,
    patch: (latestRaw: string, latestDoc: ChatDocument) => string
  ): Promise<ChatDocument> {
    const absPath = this.resolveSafe(relPath);
    return this.writeQueue.enqueue(absPath, async () => {
      const latestRaw = await fs.readFile(absPath, 'utf8');
      const nextRaw = patch(latestRaw, parseChatMd(latestRaw, this.toRelative(absPath)));
      if (nextRaw !== latestRaw) {
        await this.writeQueue.writeAtomic(absPath, nextRaw);
      }
      return this.storeParsed(absPath, nextRaw, 'server', true);
    });
  }
}
