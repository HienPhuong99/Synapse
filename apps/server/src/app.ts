import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  extractInsights,
  serializeChatMd,
  type AgentConfig,
  type ChatDocument,
  type OrchestrationMode,
  type PresenceIngestPayload,
  type ProviderSettings,
  type WsServerEvent,
} from '@synapse/shared';
import { registerMcpRoute } from './mcp/server.js';
import { getWorkspaceFileTree, readSafeWorkspaceFile } from './orchestrator/context.js';
import { ConversationOrchestrator } from './orchestrator/engine.js';
import { PresenceStore } from './presence/store.js';
import { WorkspaceSync } from './sync/watcher.js';

export interface CreateServerOptions {
  workspaceRoot: string;
  webDistDir?: string;
}

export async function createSynapseServer(options: CreateServerOptions): Promise<{
  app: FastifyInstance;
  sync: WorkspaceSync;
  orchestrator: ConversationOrchestrator;
}> {
  const app = Fastify({ logger: false });
  // No CORS: the UI is same-origin (built) or proxied by Vite (dev). Reject anything a
  // foreign web page or a DNS-rebinding host could send, including the /ws upgrade.
  // ponytail: loopback hostname check only, any local port passes; add a session token if other local apps are untrusted.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!isLoopbackHost(req.headers.host) || (origin && !isLoopbackHost(hostOf(origin)))) {
      return reply.code(403).send({ error: 'Forbidden origin' });
    }
  });
  await app.register(websocket);

  const clients = new Set<WebSocket>();
  const broadcast = (event: WsServerEvent) => {
    const payload = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  };

  const presence = new PresenceStore(broadcast);
  let sync: WorkspaceSync;
  let orchestrator: ConversationOrchestrator;

  const initWorkspace = async (rootDir: string) => {
    const nextSync = new WorkspaceSync(rootDir);
    const nextOrch = new ConversationOrchestrator(nextSync, broadcast, presence);
    await nextOrch.loadSettings();

    nextSync.on('updated', ({ document, insights, source }) => {
      broadcast({ type: 'session:updated', document, insights, source });
      broadcast({ type: 'sessions:list', sessions: nextSync.listSessions() });
    });

    nextSync.on('removed', (filePath) => {
      broadcast({ type: 'session:removed', filePath });
      broadcast({ type: 'sessions:list', sessions: nextSync.listSessions() });
    });

    await nextSync.start();
    sync = nextSync;
    orchestrator = nextOrch;
  };

  await initWorkspace(options.workspaceRoot);
  registerMcpRoute(app, () => sync);

  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'sessions:list', sessions: sync.listSessions() } satisfies WsServerEvent));
    socket.send(JSON.stringify({ type: 'presence:snapshot', presences: presence.list() } satisfies WsServerEvent));
    socket.on('close', () => {
      clients.delete(socket);
    });
  });

  app.get('/api/presence', async () => ({
    presences: presence.list(),
  }));

  app.post<{ Body: PresenceIngestPayload }>('/api/presence', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body.agent !== 'string' || !body.agent.trim() || typeof body.event !== 'string') {
      return reply.code(400).send({ error: 'Missing agent or event' });
    }
    const updated = presence.ingest(body, sync.getAllDocuments());
    return { ok: true, presence: updated };
  });

  app.get('/api/health', async () => ({
    ok: true,
    workspaceRoot: sync.workspaceRoot,
    sessionsCount: sync.listSessions().length,
  }));

  app.get('/api/workspace', async () => ({
    workspaceRoot: sync.workspaceRoot,
    sessions: sync.listSessions(),
    files: await getWorkspaceFileTree(sync.workspaceRoot),
  }));

  app.post<{ Body: { workspaceRoot?: string } }>('/api/workspace/switch', async (req, reply) => {
    const target = req.body?.workspaceRoot?.trim();
    if (!target) {
      return reply.code(400).send({ error: 'Thiếu đường dẫn workspaceRoot.' });
    }
    const resolved = path.resolve(target);
    const stat = await fsPromises.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return reply.code(404).send({ error: `Thư mục không tồn tại: ${resolved}` });
    }

    orchestrator.stopAll();
    await sync.stop();
    await initWorkspace(resolved);

    const sessions = sync.listSessions();
    const files = await getWorkspaceFileTree(sync.workspaceRoot);
    broadcast({
      type: 'workspace:changed',
      workspaceRoot: sync.workspaceRoot,
      sessions,
      files,
    });

    return {
      workspaceRoot: sync.workspaceRoot,
      sessions,
      files,
    };
  });

  app.get('/api/sessions', async () => ({
    sessions: sync.listSessions(),
  }));

  app.get<{ Querystring: { path?: string } }>('/api/sessions/doc', async (req, reply) => {
    const relPath = req.query.path;
    if (!relPath) return reply.code(400).send({ error: 'Missing path query parameter' });
    const doc = sync.getDocument(relPath);
    if (!doc) return reply.code(404).send({ error: `Session not found: ${relPath}` });
    return {
      document: doc,
      insights: extractInsights(doc),
      orchestrator: orchestrator.getStatus(doc.filePath),
    };
  });

  app.post<{
    Body: {
      fileName: string;
      title: string;
      mode?: OrchestrationMode;
      max_turns?: number;
      agents: AgentConfig[];
      initialPrompt?: string;
    };
  }>('/api/sessions', async (req, reply) => {
    const { fileName, title, mode = 'mention_and_round_robin', max_turns = 12, agents, initialPrompt } = req.body;
    if (!fileName || !title) {
      return reply.code(400).send({ error: 'fileName và title là bắt buộc.' });
    }
    const cleanName = fileName.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const relPath = cleanName === 'chat.md' || cleanName.endsWith('.chat.md') ? cleanName : `${cleanName}.chat.md`;
    const finalPath = relPath.includes('/') ? relPath : `examples/${relPath}`;

    const doc: ChatDocument = {
      filePath: finalPath,
      raw: '',
      meta: {
        schema: 'synapse/v1',
        title: title.trim(),
        project_root: '.',
        mode,
        max_turns,
        status: 'idle',
        agents: agents ?? [],
      },
      preamble: '',
      messages: initialPrompt?.trim()
        ? [
            {
              id: 'msg_01',
              author: 'human',
              timestamp: new Date().toISOString(),
              content: initialPrompt.trim(),
              mentions: [],
              fileRefs: [],
            },
          ]
        : [],
    };

    const saved = await sync.writeRaw(finalPath, serializeChatMd(doc));
    return {
      document: saved,
      insights: extractInsights(saved),
    };
  });

  app.put<{ Body: { path: string; raw: string } }>('/api/sessions/raw', async (req, reply) => {
    const { path: relPath, raw } = req.body;
    if (!relPath || typeof raw !== 'string') {
      return reply.code(400).send({ error: 'Missing path or raw content' });
    }
    const saved = await sync.writeRaw(relPath, raw);
    return { document: saved, insights: extractInsights(saved) };
  });

  app.post<{
    Body: { path: string; content: string; author?: string; autoRun?: boolean };
  }>('/api/sessions/messages', async (req, reply) => {
    const { path: relPath, content, author, autoRun } = req.body;
    if (!relPath || !content) return reply.code(400).send({ error: 'Missing path or content' });
    const doc = await orchestrator.postHumanMessage(relPath, content, author || 'human', Boolean(autoRun));
    return { document: doc, insights: extractInsights(doc) };
  });

  app.patch<{
    Body: { path: string; messageId: string; content: string };
  }>('/api/sessions/messages', async (req, reply) => {
    const { path: relPath, messageId, content } = req.body;
    if (!relPath || !messageId) return reply.code(400).send({ error: 'Missing path or messageId' });
    const doc = await orchestrator.editMessage(relPath, messageId, content);
    return { document: doc, insights: extractInsights(doc) };
  });

  app.post<{ Body: { path: string; messageId: string } }>('/api/sessions/branch', async (req, reply) => {
    const { path: relPath, messageId } = req.body;
    if (!relPath || !messageId) return reply.code(400).send({ error: 'Missing path or messageId' });
    const branched = await orchestrator.branchFromMessage(relPath, messageId);
    return { document: branched, insights: extractInsights(branched) };
  });

  app.post<{ Body: { path: string; messageId: string } }>('/api/sessions/rerun', async (req, reply) => {
    const { path: relPath, messageId } = req.body;
    if (!relPath || !messageId) return reply.code(400).send({ error: 'Missing path or messageId' });
    const doc = await orchestrator.rerunFromMessage(relPath, messageId);
    return { document: doc, insights: extractInsights(doc) };
  });

  app.post<{
    Body: { path: string; action: 'start' | 'pause' | 'step'; agentId?: string };
  }>('/api/sessions/control', async (req, reply) => {
    const { path: relPath, action, agentId } = req.body;
    if (!relPath || !action) return reply.code(400).send({ error: 'Missing path or action' });

    if (action === 'pause') {
      await orchestrator.pause(relPath);
      return { ok: true, status: orchestrator.getStatus(relPath) };
    }
    if (action === 'step') {
      orchestrator.runInBackground(relPath, orchestrator.runStep(relPath, agentId));
      return { ok: true, status: orchestrator.getStatus(relPath) };
    }
    if (action === 'start') {
      await orchestrator.startLoop(relPath);
      return { ok: true, status: orchestrator.getStatus(relPath) };
    }

    return reply.code(400).send({ error: `Unknown action: ${action}` });
  });

  app.get<{ Querystring: { path?: string } }>('/api/file', async (req, reply) => {
    if (!req.query.path) return reply.code(400).send({ error: 'Missing path' });
    try {
      return await readSafeWorkspaceFile(sync.workspaceRoot, req.query.path);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'File not found' });
    }
  });

  app.get('/api/settings', async () => orchestrator.getMaskedSettings());

  app.put<{ Body: ProviderSettings }>('/api/settings', async (req) => {
    return orchestrator.saveSettings(req.body || {});
  });

  if (options.webDistDir && fs.existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, {
      root: path.resolve(options.webDistDir),
      prefix: '/',
    });
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    presence.dispose();
    orchestrator.stopAll();
    await sync.stop();
  });

  return {
    app,
    get sync() {
      return sync;
    },
    get orchestrator() {
      return orchestrator;
    },
  };
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}
