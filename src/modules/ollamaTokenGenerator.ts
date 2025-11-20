import { lineGenerator } from "./lineGenerator";
import { info } from "./log";

export type OllamaToken = {
    model: string,
    response: string,
    done: boolean
};

export async function* ollamaTokenGenerator(url: string, data: any, bearerToken: string): AsyncGenerator<OllamaToken> {
    let tokenNumber = 0;
    for await (let line of lineGenerator(url, data, bearerToken)) {
        let parsed: OllamaToken;
        try {
            parsed = JSON.parse(line) as OllamaToken;
        } catch (e) {
            console.warn('Failed to parse JSON line: ' + line);
            info('Failed to parse JSON line: ' + line);
            continue;
        }

        tokenNumber++;
        // Log token details (log every 10th token to reduce noise, plus first and last)
        if (tokenNumber === 1 || tokenNumber % 10 === 0 || parsed.done) {
            info(`Token #${tokenNumber}: model="${parsed.model}", response="${parsed.response.replace(/\n/g, '\\n')}", done=${parsed.done}`);
        }

        yield parsed;
    }
    info(`Token stream completed. Total tokens: ${tokenNumber}`);
}