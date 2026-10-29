/**
 * Persisted LLM provider settings.
 *
 * Everything here lives in this browser only (localStorage). API keys are never
 * sent anywhere except the endpoint the user configures.
 */

export interface OpenAISettings {
  /** Base URL including the API version, e.g. http://localhost:8080/v1 */
  baseUrl: string;
  apiKey: string;
  /** Model name as exposed by the endpoint, e.g. lfm3-v1-2b */
  model: string;
}

export interface CustomGgufSettings {
  /** Display name for the custom GGUF model */
  name: string;
  /** Direct download URL to a .gguf file */
  url: string;
}

export interface LLMSettings {
  openai: OpenAISettings;
  gguf: CustomGgufSettings;
  selectedModelId: string | null;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  openai: {
    baseUrl: 'http://localhost:8080/v1',
    apiKey: '',
    model: '',
  },
  gguf: {
    name: '',
    url: '',
  },
  selectedModelId: null,
};

const STORAGE_KEY = 'scribe.llm.settings.v1';

export function loadLLMSettings(): LLMSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_LLM_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LLM_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    return {
      openai: { ...DEFAULT_LLM_SETTINGS.openai, ...(parsed.openai || {}) },
      gguf: { ...DEFAULT_LLM_SETTINGS.gguf, ...(parsed.gguf || {}) },
      selectedModelId: parsed.selectedModelId ?? null,
    };
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Could not persist LLM settings:', err);
  }
}

/** Trim whitespace and trailing slashes so URL joins stay predictable. */
export function normalizeBaseUrl(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '');
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

export function modelsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/models`;
}

/**
 * A GGUF file picked from disk is session-only: browsers cannot re-open it
 * after a reload without a permission prompt, so it is intentionally not
 * persisted alongside the other settings.
 */
let localGgufFile: File | null = null;

export function setLocalGgufFile(file: File | null): void {
  localGgufFile = file;
}

export function getLocalGgufFile(): File | null {
  return localGgufFile;
}
