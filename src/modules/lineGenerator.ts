import { info } from './log';

export async function* lineGenerator(url: string, data: any, bearerToken: string): AsyncGenerator<string> {
    // Log the outbound request
    info('=== HTTP Request to Ollama ===');
    info(`URL: ${url}`);
    info(`Method: POST`);
    info(`Has Bearer Token: ${!!bearerToken}`);
    info(`Request body: ${JSON.stringify({ ...data, prompt: data.prompt ? `[${data.prompt.length} chars]` : undefined }, null, 2)}`);

    // Request
    const controller = new AbortController();
    let res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: bearerToken ? {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          } : {
            'Content-Type': 'application/json',
          },
      signal: controller.signal,
    });

    info(`Response status: ${res.status} ${res.statusText}`);

    if (!res.ok || !res.body) {
        info('ERROR: Unable to connect to backend');
        throw Error('Unable to connect to backend');
    }

    info('Starting to read response stream...');

    // Reading stream
    let stream = res.body.getReader();
    const decoder = new TextDecoder();
    let pending: string = '';
    let chunkCount = 0;
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await stream.read();

            // If ended
            if (done) {
                info(`Stream ended. Total chunks: ${chunkCount}, Total bytes: ${totalBytes}`);
                if (pending.length > 0) { // New lines are impossible here
                    yield pending;
                }
                break;
            }

            // Append chunk
            let chunk = decoder.decode(value);
            chunkCount++;
            totalBytes += value.length;

            // Log first few chunks for debugging
            if (chunkCount <= 3) {
                info(`Chunk #${chunkCount} (${value.length} bytes): ${chunk.substring(0, 100)}...`);
            }

            pending += chunk;

            // Yield results
            while (pending.indexOf('\n') >= 0) {
                let offset = pending.indexOf('\n');
                yield pending.slice(0, offset);
                pending = pending.slice(offset + 1);
            }
        }
    } finally {
        stream.releaseLock();
        if (!stream.closed) { // Stop generation
            await stream.cancel();
            info('Stream cancelled by client');
        }
        controller.abort();
    }
}