import { CreateWebWorkerMLCEngine, MLCEngineInterface } from '@mlc-ai/web-llm';
import { ModelOption } from '../types';
import type { ChatTurn } from './types';

/**
 * Prebuilt MLC models executed on WebGPU through WebLLM.
 * These run fully in-browser with no download beyond the model weights.
 */
export const WEBGPU_MODELS: ModelOption[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (0.5B)',
    provider: 'webllm',
    vramMB: 400,
    sizeLabel: '~380 MB',
    description: 'Fastest download, ultra-lightweight. Perfect for any laptop or phone.',
    recommendedFor: 'Low memory & fast startup',
    default: true,
  },
  {
    id: 'gemma-4-E2B-it-q4f16_1-MLC',
    name: 'Gemma 4 (E2B)',
    provider: 'webllm',
    vramMB: 3380,
    sizeLabel: '~2.1 GB',
    description: "Google DeepMind's edge-optimized Gemma 4 model with Per-Layer Embeddings (PLE).",
    recommendedFor: 'Fast reasoning, multimodal & edge tasks',
  },
  {
    id: 'gemma-4-E4B-it-q4f16_1-MLC',
    name: 'Gemma 4 (E4B)',
    provider: 'webllm',
    vramMB: 4500,
    sizeLabel: '~3.8 GB',
    description: "Google DeepMind's flagship 4B effective parameter model with superior logic and code comprehension.",
    recommendedFor: 'Complex technical documentation & deep analysis',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 (1B)',
    provider: 'webllm',
    vramMB: 880,
    sizeLabel: '~880 MB',
    description: 'Great reasoning balance with fast local generation speed.',
    recommendedFor: 'Balanced daily study',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (1.5B)',
    provider: 'webllm',
    vramMB: 1200,
    sizeLabel: '~1.2 GB',
    description: 'High precision and structured adherence for detailed notes and quizzes.',
    recommendedFor: 'Advanced comprehension',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 (1.7B)',
    provider: 'webllm',
    vramMB: 1300,
    sizeLabel: '~1.3 GB',
    description: 'Hugging Face compact model optimized for instruction following.',
    recommendedFor: 'Accurate quiz creation',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 (3B)',
    provider: 'webllm',
    vramMB: 2300,
    sizeLabel: '~2.2 GB',
    description: 'Deep understanding and nuanced analysis for dense documentation.',
    recommendedFor: 'Machines with 4GB+ VRAM',
  },
];

// Custom model definition fallback for Gemma 4 E4B
const CUSTOM_GEMMA_4_E4B = {
  model: 'https://huggingface.co/mlc-ai/gemma-4-E4B-it-q4f16_1-MLC',
  model_id: 'gemma-4-E4B-it-q4f16_1-MLC',
  model_lib:
    'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/gemma-4-E2B-it-q4f16_1_cs512-webgpu.wasm',
  vram_required_MB: 4500,
  low_resource_required: false,
  required_features: ['shader-f16'],
  overrides: { context_window_size: 4096 },
};

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export interface LoadProgress {
  progress: number;
  text: string;
}

/**
 * WebLLM/WebGPU backend for MLC-format models.
 */
export class WebLLMProvider {
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private currentModelId: string | null = null;

  public getLoadedModelId(): string | null {
    return this.currentModelId;
  }

  public async load(modelId: string, onProgress: (p: LoadProgress) => void): Promise<void> {
    if (this.engine && this.currentModelId === modelId) {
      return;
    }

    if (!isWebGPUSupported()) {
      throw new Error(
        'WebGPU is not supported by your browser. Please use Google Chrome 113+ or Microsoft Edge 113+.'
      );
    }

    if (!this.worker) {
      this.worker = new Worker(new URL('./webllmWorker.ts', import.meta.url), {
        type: 'module',
      });
    }

    const options: any = {
      initProgressCallback: (report: any) => {
        onProgress({
          progress: report.progress,
          text: report.text,
        });
      },
    };

    if (modelId === 'gemma-4-E4B-it-q4f16_1-MLC') {
      options.appConfig = {
        model_list: [CUSTOM_GEMMA_4_E4B],
      };
    }

    this.engine = await CreateWebWorkerMLCEngine(this.worker, modelId, options);
    this.currentModelId = modelId;
  }

  public async *streamChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine) {
      throw new Error('WebGPU model is not loaded.');
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

  public async completeChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    if (!this.engine) {
      throw new Error('WebGPU model is not loaded.');
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

  public async unload(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.engine = null;
    this.currentModelId = null;
  }
}
