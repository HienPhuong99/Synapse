import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithWindowsRetry(tempPath: string, targetPath: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < maxAttempts) {
        await sleep(30 * attempt);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Serializes file writes per absolute path, writes atomically via temp file + rename,
 * and tracks recent write hashes so chokidar ignores self-echoes.
 */
export class WriteQueue {
  private queues = new Map<string, Promise<unknown>>();
  private selfEchoes = new Map<string, Map<string, number>>();
  private readonly echoTtlMs = 5000;

  enqueue<T>(absPath: string, task: () => Promise<T>): Promise<T> {
    const key = path.resolve(absPath).toLowerCase();
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);

    const settled = next.finally(() => {
      if (this.queues.get(key) === settled) {
        this.queues.delete(key);
      }
    });
    this.queues.set(key, settled);
    return next;
  }

  async writeAtomic(absPath: string, content: string): Promise<string> {
    const resolved = path.resolve(absPath);
    const hash = sha256(content);

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    this.recordSelfEcho(resolved, hash);

    const tempPath = `${resolved}.synapse-tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, content, 'utf8');
    try {
      await renameWithWindowsRetry(tempPath, resolved);
    } catch (err) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw err;
    }
    return hash;
  }

  private recordSelfEcho(resolvedPath: string, hash: string): void {
    const key = resolvedPath.toLowerCase();
    let hashes = this.selfEchoes.get(key);
    if (!hashes) {
      hashes = new Map();
      this.selfEchoes.set(key, hashes);
    }
    const now = Date.now();
    for (const [h, expiresAt] of hashes.entries()) {
      if (expiresAt <= now) hashes.delete(h);
    }
    hashes.set(hash, now + this.echoTtlMs);
  }

  isSelfEcho(absPath: string, content: string): boolean {
    const key = path.resolve(absPath).toLowerCase();
    const hashes = this.selfEchoes.get(key);
    if (!hashes) return false;

    const now = Date.now();
    const hash = sha256(content);
    const expiresAt = hashes.get(hash);
    if (expiresAt && expiresAt > now) {
      hashes.delete(hash);
      return true;
    }
    return false;
  }
}
