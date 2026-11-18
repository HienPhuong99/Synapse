import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileTreeNode } from '@synapse/shared';

const IGNORED_TREE_NAMES = new Set(['node_modules', '.git', 'dist', '.synapse', '.next', 'build']);

export async function getWorkspaceFileTree(workspaceRoot: string, maxDepth = 4): Promise<FileTreeNode[]> {
  const walk = async (dir: string, relBase: string, depth: number): Promise<FileTreeNode[]> => {
    if (depth > maxDepth) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const sorted = entries
      .filter((e) => !IGNORED_TREE_NAMES.has(e.name) && !e.name.includes('.synapse-tmp-'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const nodes: FileTreeNode[] = [];
    for (const entry of sorted.slice(0, 120)) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'dir',
          children: await walk(absPath, relPath, depth + 1),
        });
      } else {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
        });
      }
    }
    return nodes;
  };

  return walk(path.resolve(workspaceRoot), '', 0);
}

export async function readSafeWorkspaceFile(
  workspaceRoot: string,
  relPath: string,
  maxBytes = 24000
): Promise<{ path: string; content: string; truncated: boolean }> {
  const root = path.resolve(workspaceRoot);
  const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(root, cleanRel);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Access denied outside workspace: ${relPath}`);
  }

  const raw = await fs.readFile(resolved, 'utf8');
  if (raw.length > maxBytes) {
    return {
      path: cleanRel,
      content: raw.slice(0, maxBytes) + '\n... [truncated]',
      truncated: true,
    };
  }
  return {
    path: cleanRel,
    content: raw,
    truncated: false,
  };
}
