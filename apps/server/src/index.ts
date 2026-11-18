import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSynapseServer } from './app.js';

function parseArgs(argv: string[]): { port: number; workspace: string } {
  let port = Number(process.env.SYNAPSE_PORT || 4321);
  let workspace = process.env.SYNAPSE_WORKSPACE || '';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      port = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--workspace' && argv[i + 1]) {
      workspace = argv[i + 1];
      i += 1;
    }
  }

  if (!workspace) {
    // Default to repo root (two levels up from apps/server/src or dist)
    const here = path.dirname(fileURLToPath(import.meta.url));
    workspace = path.resolve(here, '../../..');
  }

  return { port, workspace: path.resolve(workspace) };
}

async function main() {
  const { port, workspace } = parseArgs(process.argv.slice(2));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDistDir = path.resolve(here, '../../web/dist');

  const { app, sync } = await createSynapseServer({
    workspaceRoot: workspace,
    webDistDir,
  });

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Synapse server listening at http://127.0.0.1:${port}`);
  console.log(`Watching workspace: ${sync.workspaceRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
