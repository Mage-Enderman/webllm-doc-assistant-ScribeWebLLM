import { ModelOption, ModelStatus } from '../types';
import { WebLLMProvider, WEBGPU_MODELS } from './webllm';
import { GgufProvider } from './gguf';
import { OpenAIProvider } from './openai';
import { DiscoveredServer } from './discovery';
import {
  getLocalGgufFile,
  loadLLMSettings,
  normalizeBaseUrl,
  saveLLMSettings,
  type OpenAISettings,
} from './settings';
import type { ChatTurn, GenerationOptions } from './types';

export { isWebGPUSupported, WEBGPU_MODELS } from './webllm';
export { getGgufRuntimeLabel } from './gguf';

/** Stable id for the single user-supplied GGUF slot. */
export const CUSTOM_GGUF_ID = 'gguf:custom';

/** Servers found on this machine, shared with the model list. */
let discoveredServers: DiscoveredServer[] = [];

export function setDiscoveredServers(servers: DiscoveredServer[]): void {
  discoveredServers = servers;
}

export function getDiscoveredServers(): DiscoveredServer[] {
  return discoveredServers;
}

/** Model ids are namespaced by provider so lookups stay unambiguous. */
export function remoteModelId(model: string): string {
  return `openai:${model.trim()}`;
}

/** Discovered ids include the host, since two servers can expose the same name. */
export function discoveredModelId(baseUrl: string, model: string): string {
  return `openai:${hostOf(baseUrl)}/${model}`;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Comparable key for an endpoint, so localhost:1234 and 127.0.0.1:1234 are
 * recognised as the same server.
 */
/** True when both URLs point at the same local endpoint. */
export function sameEndpoint(a: string, b: string): boolean {
  return endpointKey(normalizeBaseUrl(a)) === endpointKey(normalizeBaseUrl(b));
}

function endpointKey(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ? 'loopback' : url.hostname;
    return `${host}:${url.port}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return baseUrl;
  }
}

function customGgufOption(): ModelOption | null {
  const settings = loadLLMSettings();
  const file = getLocalGgufFile();
  const url = settings.gguf.url.trim();

  if (!url && !file) return null;

  const name = settings.gguf.name.trim() || file?.name || 'Custom GGUF';
  const sizeMb = file ? file.size / 1048576 : 0;

  return {
    id: CUSTOM_GGUF_ID,
    name,
    provider: 'gguf',
    vramMB: Math.round(sizeMb * 1.2) || 1400,
    sizeLabel: file ? `~${sizeMb.toFixed(0)} MB` : 'Custom GGUF',
    description: url
      ? `Your own GGUF model, downloaded from ${url}`
      : `Your own GGUF model read from ${file?.name || 'disk'}`,
    recommendedFor: 'Any GGUF the in-browser llama.cpp supports',
    sourceUrl: url || undefined,
  };
}

function remoteOption(): ModelOption | null {
  const { openai } = loadLLMSettings();
  const model = openai.model.trim();
  const baseUrl = normalizeBaseUrl(openai.baseUrl);

  if (!model || !baseUrl) return null;

  return {
    id: remoteModelId(model),
    name: model,
    provider: 'openai',
    vramMB: 0,
    sizeLabel: 'Remote',
    description: `OpenAI-compatible endpoint at ${baseUrl}`,
    recommendedFor: `Models served by ${hostOf(baseUrl)}`,
  };
}

/**
 * Models exposed by servers discovered on this machine. The configured
 * endpoint is skipped so it is not listed twice.
 */
function discoveredOptions(): ModelOption[] {
  const { openai } = loadLLMSettings();
  const configuredBase = endpointKey(normalizeBaseUrl(openai.baseUrl));
  const configuredModel = openai.model.trim();
  const options: ModelOption[] = [];

  for (const server of discoveredServers) {
    const baseUrl = normalizeBaseUrl(server.baseUrl);
    if (!baseUrl) continue;

    for (const model of server.models) {
      if (endpointKey(baseUrl) === configuredBase && model === configuredModel) continue;
      options.push({
        id: discoveredModelId(baseUrl, model),
        name: model,
        provider: 'openai',
        vramMB: 0,
        sizeLabel: hostOf(baseUrl),
        description: `${server.label} at ${baseUrl}`,
        recommendedFor: `Auto-detected model served by ${server.label}`,
        apiBaseUrl: baseUrl,
      });
    }
  }

  return options;
}

/** Every model currently selectable, grouped by provider in the UI. */
export function getAvailableModels(): ModelOption[] {
  const models: ModelOption[] = [...WEBGPU_MODELS];
  const custom = customGgufOption();
  if (custom) models.push(custom);
  models.push(...discoveredOptions());
  const remote = remoteOption();
  if (remote) models.push(remote);
  return models;
}

export function getDefaultModelId(): string {
  return WEBGPU_MODELS.find((m) => m.default)?.id || WEBGPU_MODELS[0].id;
}

function resolveModel(modelId: string | null | undefined): ModelOption | undefined {
  const models = getAvailableModels();
  if (modelId) {
    const found = models.find((m) => m.id === modelId);
    if (found) return found;
  }
  return models.find((m) => m.id === getDefaultModelId()) || models[0];
}

class LLMEngineManager {
  private webllm = new WebLLMProvider();
  private gguf = new GgufProvider();
  private openai: OpenAIProvider | null = null;
  private currentModelId: string | null = null;
  private currentProvider: ModelOption['provider'] | null = null;
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

  private releaseOtherProviders(target: ModelOption['provider']): Promise<void> {
    const jobs: Promise<void>[] = [];
    if (this.currentProvider && this.currentProvider !== target) {
      if (this.currentProvider === 'webllm') jobs.push(this.webllm.unload());
      if (this.currentProvider === 'gguf') jobs.push(this.gguf.unload());
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /**
   * Resolves the endpoint for an OpenAI-compatible model: auto-detected models
   * carry their own base URL, so they do not disturb the saved settings.
   */
  private openAISettingsFor(model: ModelOption): OpenAISettings {
    const settings = loadLLMSettings().openai;
    return {
      ...settings,
      baseUrl: model.apiBaseUrl || settings.baseUrl,
      model: model.name,
    };
  }

  /**
   * Loads (or switches to) the selected model, whichever provider serves it.
   */
  public async loadModel(modelId?: string): Promise<void> {
    const settings = loadLLMSettings();
    const model = resolveModel(modelId ?? this.currentModelId ?? settings.selectedModelId);

    if (!model) {
      throw new Error('No model is available.');
    }

    if (this.currentModelId === model.id && this.currentStatus.state === 'ready') {
      return;
    }

    saveLLMSettings({ ...settings, selectedModelId: model.id });

    this.notifyStatus({
      state: 'downloading',
      progress: 0.02,
      text: `Initializing ${model.name}...`,
      error: undefined,
      loadedModelId: model.id,
    });

    try {
      await this.releaseOtherProviders(model.provider);

      if (model.provider === 'webllm') {
        await this.webllm.load(model.id, (progress) => {
          this.notifyStatus({
            state: progress.progress >= 1 ? 'compiling' : 'downloading',
            progress: progress.progress,
            text: progress.text,
            loadedModelId: model.id,
          });
        });
      } else if (model.provider === 'gguf') {
        await this.gguf.load(model, (progress) => {
          this.notifyStatus({
            state: progress.progress >= 1 ? 'compiling' : 'downloading',
            progress: progress.progress,
            text: progress.text,
            loadedModelId: model.id,
          });
        });
      } else {
        const endpoint = this.openAISettingsFor(model);
        this.openai = new OpenAIProvider(endpoint);

        this.notifyStatus({
          state: 'downloading',
          progress: 0.4,
          text: `Connecting to ${normalizeBaseUrl(endpoint.baseUrl)}...`,
          loadedModelId: model.id,
        });

        await this.openai.ping();
      }

      this.currentModelId = model.id;
      this.currentProvider = model.provider;

      this.notifyStatus({
        state: 'ready',
        progress: 1,
        text:
          model.provider === 'openai'
            ? `Connected to ${normalizeBaseUrl(this.openAISettingsFor(model).baseUrl)}`
            : 'Model ready for local inference!',
        loadedModelId: model.id,
      });
    } catch (err: any) {
      console.error('Failed to load LLM model:', err);
      this.currentModelId = null;
      this.currentProvider = null;
      const runtimeUnsupported = err?.code === 'runtime-unsupported';
      this.notifyStatus({
        state: 'error',
        progress: 0,
        text: `Failed to initialize ${model.name}.`,
        error: err?.message || 'Unknown model initialization error.',
        errorKind: runtimeUnsupported ? 'runtime' : 'other',
        loadedModelId: model.id,
      });
      throw err;
    }
  }

  private async ensureModel(modelId?: string): Promise<ModelOption> {
    const model = resolveModel(modelId ?? this.currentModelId);
    if (!model) {
      throw new Error('No model is available.');
    }
    if (this.currentStatus.state !== 'ready' || this.currentModelId !== model.id) {
      await this.loadModel(model.id);
    }
    return model;
  }

  /**
   * Stream chat completion from whichever provider serves the active model.
   */
  public async *streamChat(
    messages: ChatTurn[],
    options: GenerationOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const model = await this.ensureModel();

    if (model.provider === 'webllm') {
      yield* this.webllm.streamChat(messages, options);
      return;
    }

    if (model.provider === 'gguf') {
      yield* this.gguf.streamChat(messages, options);
      return;
    }

    if (!this.openai) {
      this.openai = new OpenAIProvider(this.openAISettingsFor(model));
    }
    yield* this.openai.streamChat(messages, options);
  }

  /**
   * Non-streaming chat completion.
   */
  public async completeChat(
    messages: ChatTurn[],
    options: GenerationOptions = {}
  ): Promise<string> {
    const model = await this.ensureModel();

    if (model.provider === 'webllm') {
      return this.webllm.completeChat(messages, options);
    }

    if (model.provider === 'gguf') {
      return this.gguf.completeChat(messages, options);
    }

    if (!this.openai) {
      this.openai = new OpenAIProvider(this.openAISettingsFor(model));
    }
    return this.openai.completeChat(messages, options);
  }
}

export const llmEngine = new LLMEngineManager();
