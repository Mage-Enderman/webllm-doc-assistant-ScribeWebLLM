import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Hook up WebLLM Web Worker message handler
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
