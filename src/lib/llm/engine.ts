import { CreateWebWorkerMLCEngine, MLCEngineInterface } from '@mlc-ai/web-llm';
import { ModelOption, ModelStatus } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (0.5B)',
    vramMB: 400,
    sizeLabel: '~380 MB',
    description: 'Fastest download, ultra-lightweight. Perfect for any laptop or phone.',
    recommendedFor: 'Low memory & fast startup',
    default: true,
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 (1B)',
    vramMB: 880,
    sizeLabel: '~880 MB',
    description: 'Great reasoning balance with fast local generation speed.',
    recommendedFor: 'Balanced daily study',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (1.5B)',
    vramMB: 1200,
    sizeLabel: '~1.2 GB',
    description: 'High precision and structured adherence for detailed notes and quizzes.',
    recommendedFor: 'Advanced comprehension',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 (1.7B)',
    vramMB: 1300,
    sizeLabel: '~1.3 GB',
    description: 'Hugging Face compact model optimized for instruction following.',
    recommendedFor: 'Accurate quiz creation',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 (3B)',
    vramMB: 2300,
    sizeLabel: '~2.2 GB',
    description: 'Deep understanding and nuanced analysis for dense documentation.',
    recommendedFor: 'Machines with 4GB+ VRAM',
  },
];

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

class LLMEngineManager {
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private currentModelId: string | null = null;
  private statusListeners: ((status: ModelStatus) => void)[] = [];
  private currentStatus: ModelStatus = {
    state: 'idle',
    progress: 0,
    text: 'Model not loaded',
  };

  public getStatus(): ModelStatus {
    return this.currentStatus;
  }

  public subscribeStatus(listener: (status: ModelStatus) => void): () => void {
    this.statusListeners.push(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatus(status: Partial<ModelStatus>) {
    this.currentStatus = { ...this.currentStatus, ...status };
    this.statusListeners.forEach((l) => l(this.currentStatus));
  }

  /**
   * Initializes or switches the WebLLM engine with the selected model
   */
  public async loadModel(modelId: string = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'): Promise<void> {
    if (this.engine && this.currentModelId === modelId && this.currentStatus.state === 'ready') {
      return;
    }

    if (!isWebGPUSupported()) {
      this.notifyStatus({
        state: 'error',
        progress: 0,
        text: 'WebGPU is not supported by your browser.',
        error: 'Please use Google Chrome, Microsoft Edge, or a modern browser with WebGPU enabled.',
      });
      throw new Error('WebGPU is not supported.');
    }

    this.notifyStatus({
      state: 'downloading',
      progress: 0.02,
      text: `Initializing ${modelId}...`,
      loadedModelId: modelId,
    });

    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./webllmWorker.ts', import.meta.url), {
          type: 'module',
        });
      }

      this.engine = await CreateWebWorkerMLCEngine(this.worker, modelId, {
        initProgressCallback: (report) => {
          this.notifyStatus({
            state: report.progress >= 1 ? 'compiling' : 'downloading',
            progress: report.progress,
            text: report.text,
            loadedModelId: modelId,
          });
        },
      });

      this.currentModelId = modelId;
      this.notifyStatus({
        state: 'ready',
        progress: 1.0,
        text: 'Model ready for local inference!',
        loadedModelId: modelId,
      });
    } catch (err: any) {
      console.error('Failed to load WebLLM model:', err);
      this.notifyStatus({
        state: 'error',
        progress: 0,
        text: 'Failed to initialize model.',
        error: err?.message || 'Unknown WebGPU or network initialization error.',
      });
      throw err;
    }
  }

  /**
   * Stream chat completion
   */
  public async *streamChat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine) {
      await this.loadModel(this.currentModelId || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    }

    if (!this.engine) {
      throw new Error('Engine failed to initialize.');
    }

    const { temperature = 0.3, max_tokens = 750 } = options;

    const completion = await this.engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      stream: true,
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  /**
   * Non-streaming chat completion
   */
  public async completeChat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    if (!this.engine) {
      await this.loadModel(this.currentModelId || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    }

    if (!this.engine) {
      throw new Error('Engine failed to initialize.');
    }

    const { temperature = 0.2, max_tokens = 800 } = options;

    const response = await this.engine.chat.completions.create({
      messages,
      temperature,
      max_tokens,
      stream: false,
    });

    return response.choices[0]?.message?.content || '';
  }
}

export const llmEngine = new LLMEngineManager();
