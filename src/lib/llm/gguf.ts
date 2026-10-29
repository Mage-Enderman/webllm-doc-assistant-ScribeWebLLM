import { Wllama } from '@wllama/wllama/esm/index.js';
import wllamaWasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';
import { ModelOption } from '../types';
import { getLocalGgufFile } from './settings';
import type { ChatTurn } from './types';
import type { LoadProgress } from './webllm';

/**
 * GGUF models executed in-browser by llama.cpp compiled to WebAssembly (wllama).
 *
 * There are no built-in presets: this runtime can run any supported GGUF the
 * user supplies, either from disk or from a direct download URL.
 */
const CONTEXT_WINDOW = 4096;

/**
 * Raised when a model's GGUF architecture is newer than the compiled llama.cpp
 * inside the bundled wasm. Distinguished from download/network failures so the
 * UI can explain the limitation instead of reporting a red error.
 */
export class GgufRuntimeError extends Error {
  readonly code = 'runtime-unsupported';

  constructor(message: string) {
    super(message);
    this.name = 'GgufRuntimeError';
  }
}

export function getGgufRuntimeLabel(): string {
  try {
    return Wllama.getLibllamaVersion();
  } catch {
    return 'unknown';
  }
}

function enhanceLoadError(err: unknown, model: ModelOption): Error {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('unknown model architecture') || lower.includes('unsupported model')) {
    return new GgufRuntimeError(
      `${model.name} uses a model architecture that the bundled in-browser llama.cpp runtime ` +
        `(${getGgufRuntimeLabel()}) does not support yet. Run it through the OpenAI-compatible ` +
        `option instead (llama.cpp server, LM Studio or Ollama), or pick a GGUF built for a ` +
        `supported architecture. Original error: ${message}`
    );
  }

  if (lower.includes('fetch') || lower.includes('networkerror') || lower.includes('failed to fetch')) {
    return new Error(
      `Could not download the GGUF file for ${model.name}. Check your connection and that the ` +
        `download URL allows cross-origin requests (CORS). Original error: ${message}`
    );
  }

  return new Error(message);
}

/**
 * In-browser GGUF backend (llama.cpp via WebAssembly).
 */
export class GgufProvider {
  private wllama: Wllama | null = null;
  private currentModelId: string | null = null;

  private getInstance(): Wllama {
    if (!this.wllama) {
      this.wllama = new Wllama({ default: wllamaWasmUrl }, { allowOffline: true });
    }
    return this.wllama;
  }

  public getLoadedModelId(): string | null {
    return this.currentModelId;
  }

  public async load(model: ModelOption, onProgress: (p: LoadProgress) => void): Promise<void> {
    if (this.currentModelId === model.id) return;

    const wllama = this.getInstance();

    if (this.currentModelId) {
      await wllama.exit();
      this.currentModelId = null;
    }

    const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
      const loadedMb = loaded / 1048576;
      const totalMb = total / 1048576;
      onProgress({
        progress: total > 0 ? Math.min(1, loaded / total) : 0,
        text: `Downloading ${model.name}: ${loadedMb.toFixed(0)} / ${totalMb.toFixed(0)} MB`,
      });
    };

    try {
      if (model.sourceUrl) {
        await wllama.loadModelFromUrl(model.sourceUrl, {
          n_ctx: CONTEXT_WINDOW,
          progressCallback,
        });
      } else {
        const file = getLocalGgufFile();
        if (!file) {
          throw new Error(
            `No GGUF file is selected for ${model.name}. Choose one in Model settings.`
          );
        }
        // Local files are read from disk directly, so there is no download progress.
        onProgress({ progress: 0.2, text: `Loading ${file.name} into the llama.cpp runtime...` });
        await wllama.loadModel([file], {
          n_ctx: CONTEXT_WINDOW,
        });
        onProgress({ progress: 0.95, text: 'Model loaded, preparing context...' });
      }
    } catch (err) {
      throw enhanceLoadError(err, model);
    }

    this.currentModelId = model.id;
  }

  private requireLoaded(): Wllama {
    if (!this.wllama || !this.currentModelId) {
      throw new Error('No GGUF model is loaded.');
    }
    return this.wllama;
  }

  public async *streamChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): AsyncGenerator<string, void, unknown> {
    const wllama = this.requireLoaded();
    const { temperature = 0.3, max_tokens = 750 } = options;

    const iterator = await wllama.createChatCompletion({
      messages,
      temperature,
      max_tokens,
      stream: true,
    });

    for await (const chunk of iterator) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  public async completeChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    const wllama = this.requireLoaded();
    const { temperature = 0.2, max_tokens = 800 } = options;

    const response = await wllama.createChatCompletion({
      messages,
      temperature,
      max_tokens,
      stream: false,
    });

    return response.choices?.[0]?.message?.content || '';
  }

  public async unload(): Promise<void> {
    if (this.wllama) {
      try {
        await this.wllama.exit();
      } catch (err) {
        console.warn('Failed to unload GGUF model:', err);
      }
    }
    this.wllama = null;
    this.currentModelId = null;
  }
}
