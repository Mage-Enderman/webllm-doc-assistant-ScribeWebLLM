import {
  OpenAISettings,
  chatCompletionsUrl,
  modelsUrl,
  normalizeBaseUrl,
} from './settings';
import type { ChatTurn } from './types';

function buildHeaders(settings: OpenAISettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = settings.apiKey.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function endpointLabel(settings: OpenAISettings): string {
  return normalizeBaseUrl(settings.baseUrl) || 'the configured endpoint';
}

async function describeHttpError(res: Response, settings: OpenAISettings): Promise<Error> {
  let body = '';
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    // ignore unreadable bodies
  }

  let hint = '';
  if (res.status === 401 || res.status === 403) {
    hint = ' Check the API key in Model settings.';
  } else if (res.status === 404) {
    hint =
      ' Check that the base URL includes the API path (usually /v1) and that the model name matches what the server exposes.';
  }

  return new Error(
    `Request to ${endpointLabel(settings)} failed (${res.status} ${res.statusText}).${hint}${
      body ? ` Response: ${body}` : ''
    }`
  );
}

async function safeFetch(
  url: string,
  init: RequestInit,
  settings: OpenAISettings
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach ${endpointLabel(settings)}. Check that the server is running at that URL and ` +
        `that it allows cross-origin requests (CORS). Original error: ${message}`
    );
  }
}

/**
 * OpenAI-compatible backend for models hosted elsewhere: llama.cpp server,
 * LM Studio, Ollama, vLLM, OpenRouter, or any hosted API that speaks the
 * /chat/completions contract.
 */
export class OpenAIProvider {
  constructor(private settings: OpenAISettings) {}

  /** Best-effort connectivity/auth probe used before marking the model ready. */
  public async ping(): Promise<string[]> {
    const res = await safeFetch(
      modelsUrl(this.settings.baseUrl),
      { method: 'GET', headers: buildHeaders(this.settings) },
      this.settings
    );

    if (res.status === 401 || res.status === 403) {
      throw await describeHttpError(res, this.settings);
    }
    // Some servers do not implement /models at all; that is fine.
    if (!res.ok) return [];

    try {
      const json = await res.json();
      const items = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      return items
        .map((item: any) => (typeof item === 'string' ? item : item?.id))
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    } catch {
      return [];
    }
  }

  private body(messages: ChatTurn[], options: { temperature?: number; max_tokens?: number }, stream: boolean) {
    return JSON.stringify({
      model: this.settings.model.trim(),
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 750,
      stream,
    });
  }

  public async *streamChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): AsyncGenerator<string, void, unknown> {
    const res = await safeFetch(
      chatCompletionsUrl(this.settings.baseUrl),
      { method: 'POST', headers: buildHeaders(this.settings), body: this.body(messages, options, true) },
      this.settings
    );

    if (!res.ok) {
      throw await describeHttpError(res, this.settings);
    }

    const contentType = res.headers.get('content-type') || '';

    // A server may ignore stream:true and answer with a single JSON body.
    if (!res.body || !contentType.includes('text/event-stream')) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        const content = parsed?.choices?.[0]?.message?.content ?? parsed?.choices?.[0]?.text;
        if (typeof content === 'string' && content) yield content;
        return;
      } catch {
        if (text) yield text;
        return;
      }
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const rawLine of event.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.text;
            if (typeof delta === 'string' && delta) yield delta;
          } catch {
            // Ignore keep-alive comments or partial JSON fragments.
          }
        }
      }
    }

    // Flush any trailing event that did not end with a blank line.
    const remaining = buffer.trim();
    if (remaining.startsWith('data:')) {
      const payload = remaining.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.text;
          if (typeof delta === 'string' && delta) yield delta;
        } catch {
          // ignore
        }
      }
    }
  }

  public async completeChat(
    messages: ChatTurn[],
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    const res = await safeFetch(
      chatCompletionsUrl(this.settings.baseUrl),
      { method: 'POST', headers: buildHeaders(this.settings), body: this.body(messages, options, false) },
      this.settings
    );

    if (!res.ok) {
      throw await describeHttpError(res, this.settings);
    }

    const parsed = await res.json();
    return parsed?.choices?.[0]?.message?.content ?? parsed?.choices?.[0]?.text ?? '';
  }
}
