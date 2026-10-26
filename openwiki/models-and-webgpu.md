---
type: concept
title: WebGPU & In-Browser Model Inference
description: Technical architecture for in-browser WebGPU execution via WebLLM, model caching, Google DeepMind Gemma 4 E2B/E4B, and EmbeddingGemma 2 270M vector embeddings.
tags: [webllm, webgpu, gemma, gemma4, embeddinggemma, transformers, mlc]
sources:
  - id: openwiki-source-c30e4deae9f02bbc4a2e69b3
    resource: repo://src/lib/llm/engine.ts
  - id: openwiki-source-b0a726dbac47c52c317c1e4a
    resource: repo://src/lib/llm/webllmWorker.ts
  - id: openwiki-source-015589cc7b2240c9fdcf3bb0
    resource: repo://src/lib/rag/embeddings.ts
generated: { by: "antigravity", at: "2026-10-26T10:33:50.945Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T10:46:08.317Z
---

# WebGPU & In-Browser Model Inference

This document provides technical specifications for in-browser neural execution using **WebLLM** (`@mlc-ai/web-llm`) with **WebGPU**, Google DeepMind's **Gemma 4** model variants, and the **EmbeddingGemma 2** (270M) vector embedding engine in ScribeWebLLM.

---

## 1. WebLLM Runtime Architecture

WebLLM executes quantized language models locally on the user's GPU using the W3C WebGPU standard:
- **Dedicated Web Worker**: To ensure the main React UI thread maintains a fluid 60 FPS, all WebGPU inference and shader compilation run in a background Web Worker ([`src/lib/llm/webllmWorker.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/llm/webllmWorker.ts)) using `WebWorkerMLCEngineHandler`.
- **Engine Manager**: `LLMEngineManager` ([`src/lib/llm/engine.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/llm/engine.ts)) exposes singleton methods for streaming completions (`streamChat`), non-streaming responses (`completeChat`), and reactive initialization status notifications.
- **CacheStorage Persistence**: Downloaded model parameters and compiled shader pipelines are automatically cached in the browser's native `CacheStorage`. Subsequent visits load instantly without network transfer.
- **Hardware Detection**: `isWebGPUSupported()` inspects `navigator.gpu` at launch, presenting actionable guidance for users without WebGPU-compatible browsers.

---

## 2. Supported Language Models Catalog

ScribeWebLLM offers a diverse catalog of small, browser-optimized models:

| Model ID | Display Name | Effective Parameters | VRAM Footprint | Architecture & Highlights |
| :--- | :--- | :--- | :--- | :--- |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | Qwen 2.5 (0.5B) | 0.5B | ~400 MB | Fastest initial download (~380 MB); runs on mobile and ultra-low VRAM. |
| `gemma-4-E2B-it-q4f16_1-MLC` | Gemma 4 (E2B) | 2.0B Effective | ~3.38 GB | Google DeepMind edge model with Per-Layer Embeddings (PLE); low latency. |
| `gemma-4-E4B-it-q4f16_1-MLC` | Gemma 4 (E4B) | 4.0B Effective | ~4.50 GB | Flagship 4B effective parameter model with superior logic and code reasoning. |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | Llama 3.2 (1B) | 1.2B | ~880 MB | Balanced general reasoning and fast token generation. |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | Qwen 2.5 (1.5B) | 1.5B | ~1.20 GB | High precision for structured notes and technical summaries. |
| `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | SmolLM2 (1.7B) | 1.7B | ~1.30 GB | Hugging Face compact model optimized for strict instruction following. |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | Llama 3.2 (3B) | 3.2B | ~2.30 GB | Nuanced comprehension for dense multi-page documentation. |

---

## 3. EmbeddingGemma 2 (270M Version)

Embedding generation is implemented in [`src/lib/rag/embeddings.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/rag/embeddings.ts) following Google's official [EmbeddingGemma 2 Developer Guide](https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/):

- **Text & Code Backbone**: 270M parameter modular encoder (130M transformer + 140M embedder) providing MTEB Code leadership.
- **Context Window**: 8,192 tokens, permitting indexing of large code blocks and dense specifications without fragmenting context.
- **Unified 768-Dimensional Space**: Encodes concepts into a 768-dimensional vector space.
- **Matryoshka Representation Learning (MRL)**: Supports truncation to 512, 256, or 128 dimensions to reduce vector storage overhead in IndexedDB.
- **Task-Steered Prompts**:
  - Search queries: `task: search result | query: <query>`
  - Document chunks: `title: <title> | text: <text>`
- **Strict L2-Normalization**: `l2Normalize()` normalizes all vectors to unit length so that cosine similarity evaluates via simple dot product multiplication.

---

## 4. Fallback Embedding Engine (`all-MiniLM-L6-v2`)

For resource-constrained devices, ScribeWebLLM provides `Xenova/all-MiniLM-L6-v2`:
- Footprint: ~80 MB download.
- Output: 384-dimensional normalized dense vectors.
- Context Window: 512 tokens.
- Deterministic fallback hashing vectorizer for zero-dependency test scenarios.
