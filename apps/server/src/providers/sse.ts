/**
 * Reads an SSE response stream line-by-line and invokes `onData` for each `data:` payload.
 */
export async function readSse(res: Response, onData: (data: string) => void): Promise<void> {
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLines = (lines: string[]) => {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      onData(data);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    processLines(lines);
  }

  if (buffer.trim()) {
    processLines([buffer]);
  }
}
