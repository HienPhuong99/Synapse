import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { appendMessageRaw, extractFileRefs, extractMentions, nextMessageId } from '@synapse/shared';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod/v4';
import type { WorkspaceSync } from '../sync/watcher.js';

interface Claim {
  agent: string;
  expiresAt: number;
}

/**
 * Advisory file claims (like mcp_agent_mail reservations): agents agree to respect them; nothing is locked on disk.
 * ponytail: in-memory, lost on restart; add a pre-commit guard if agents start ignoring them.
 */
export class ClaimStore {
  private claims = new Map<string, Claim>();

  private key(root: string, p: string): string {
    const norm = p.replace(/\\/g, '/').replace(/^\.?\/+/, '');
    return `${root}|${process.platform === 'win32' ? norm.toLowerCase() : norm}`;
  }

  active(root: string): { path: string; agent: string; expiresAt: string }[] {
    const now = Date.now();
    const out = [];
    for (const [k, c] of this.claims) {
      if (c.expiresAt <= now) this.claims.delete(k);
      else if (k.startsWith(`${root}|`)) out.push({ path: k.slice(root.length + 1), agent: c.agent, expiresAt: new Date(c.expiresAt).toISOString() });
    }
    return out;
  }

  claim(root: string, agent: string, paths: string[], ttlMinutes: number) {
    const now = Date.now();
    const granted: string[] = [];
    const conflicts: { path: string; heldBy: string }[] = [];
    for (const p of paths) {
      const k = this.key(root, p);
      const cur = this.claims.get(k);
      if (cur && cur.expiresAt > now && cur.agent !== agent) {
        conflicts.push({ path: p, heldBy: cur.agent });
      } else {
        this.claims.set(k, { agent, expiresAt: now + ttlMinutes * 60_000 });
        granted.push(p);
      }
    }
    return { granted, conflicts };
  }

  release(root: string, agent: string, paths?: string[]): number {
    let n = 0;
    const only = paths ? new Set(paths.map((p) => this.key(root, p))) : null;
    for (const [k, c] of this.claims) {
      if (c.agent === agent && k.startsWith(`${root}|`) && (!only || only.has(k))) {
        this.claims.delete(k);
        n++;
      }
    }
    return n;
  }
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

function buildServer(sync: WorkspaceSync, claims: ClaimStore): McpServer {
  const server = new McpServer({ name: 'synapse', version: '0.2.0' });
  const root = sync.workspaceRoot;
  const fileArg = z.string().default('chat.md').describe('Board file relative to the workspace, e.g. chat.md');
  const agentArg = z.string().regex(/^[\w.-]+$/).describe('Your agent id, e.g. claude or gemini');

  server.registerTool(
    'read_thread',
    {
      description: 'Read the latest messages of the shared chat.md board plus active file claims.',
      inputSchema: { file: fileArg, last: z.number().int().min(1).max(50).default(8) },
    },
    async ({ file, last }) => {
      const doc = sync.getDocument(file);
      if (!doc) return { ...text(`Không tìm thấy ${file}`), isError: true };
      const messages = doc.messages.slice(-last).map((m) => ({
        id: m.id,
        author: m.author,
        to: m.meta?.target,
        status: m.meta?.headingSuffix,
        timestamp: m.timestamp,
        content: m.content,
      }));
      return text({ file: doc.filePath, total: doc.messages.length, messages, claims: claims.active(root) });
    }
  );

  server.registerTool(
    'post_message',
    {
      description:
        'Append your turn to the shared board. Synapse writes the heading in the right format; never edit chat.md by hand.',
      inputSchema: {
        agent: agentArg,
        body: z.string().min(1).describe('Markdown body of your message'),
        to: z.string().regex(/^[\w.-]+$/).optional().describe('Recipient agent id, or human'),
        status: z.enum(['OPEN', 'FIXED', 'AGREED', 'DONE', 'READY FOR REVIEW']).optional(),
        file: fileArg,
      },
    },
    async ({ agent, body, to, status, file }) => {
      const doc = await sync.patchRaw(file, (raw, latest) => {
        const id = nextMessageId(latest.messages);
        return appendMessageRaw(raw, {
          id,
          author: agent.toLowerCase(),
          timestamp: new Date().toISOString(),
          content: body.trim(),
          meta: { id, target: to?.toLowerCase(), headingSuffix: status ? `Status: \`${status}\`` : undefined },
          mentions: extractMentions(body),
          fileRefs: extractFileRefs(body),
        });
      });
      return text(`Đã ghi lượt ${doc.messages.length} vào ${doc.filePath}.`);
    }
  );

  server.registerTool(
    'claim_files',
    {
      description:
        'Reserve files/globs before editing so the other agent does not touch them. Advisory, expires after ttl_minutes.',
      inputSchema: {
        agent: agentArg,
        paths: z.array(z.string().min(1)).min(1).describe('Workspace-relative paths or globs'),
        ttl_minutes: z.number().int().min(1).max(480).default(30),
      },
    },
    async ({ agent, paths, ttl_minutes }) => {
      const res = claims.claim(root, agent.toLowerCase(), paths, ttl_minutes);
      return { ...text(res), isError: res.conflicts.length > 0 };
    }
  );

  server.registerTool(
    'release_files',
    {
      description: 'Release your claims (all of them when paths is omitted).',
      inputSchema: { agent: agentArg, paths: z.array(z.string()).optional() },
    },
    async ({ agent, paths }) => text({ released: claims.release(root, agent.toLowerCase(), paths) })
  );

  return server;
}

/** Stateless Streamable HTTP endpoint: `claude mcp add --transport http synapse http://127.0.0.1:4321/mcp`. */
export function registerMcpRoute(app: FastifyInstance, getSync: () => WorkspaceSync, claims = new ClaimStore()): void {
  app.post('/mcp', async (req, reply) => {
    const server = buildServer(getSync(), claims);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  // Stateless: no SSE stream or session to resume/delete.
  app.route({ method: ['GET', 'DELETE'], url: '/mcp', handler: (_req, reply) => reply.code(405).send() });
}
