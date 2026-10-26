---
type: concept
title: System Overview & Architecture
description: Architectural overview of ScribeWebLLM, a 100% in-browser, privacy-first documentation and learning assistant powered by WebGPU, WebLLM, and client-side RAG.
tags: [architecture, webllm, webgpu, rag, local-first, github-pages]
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-54631e6ebf1d3b815c4a5eed
    resource: repo://src/App.tsx
  - id: openwiki-source-c30e4deae9f02bbc4a2e69b3
    resource: repo://src/lib/llm/engine.ts
generated: { by: "antigravity", at: "2026-10-26T10:33:50.945Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T10:46:08.317Z
---

# System Overview & Architecture

**ScribeWebLLM** (DocuBrain AI) is a client-side, local-first documentation learning assistant designed to run large language models and retrieval pipelines directly inside the user's web browser using **WebGPU** and **WebLLM**.

Inspired by [rimc008/Rag_project2](https://github.com/rimc008/Rag_project2), ScribeWebLLM eliminates all backend server requirements (FastAPI, Qdrant, external API endpoints) by executing document ingestion, semantic embeddings, lexical indexing, and model inference entirely on client hardware.

```mermaid
flowchart TD
    subgraph Browser_Environment ["Client Web Browser (Zero-Backend)"]
        direction TB

        subgraph Ingestion_Layer ["Ingestion & Local Storage"]
            Upload["User Documents (PDF, MD, Notes)"] --> DocProc["Document Processor (PDF.js)"]
            DocProc --> Chunker["Recursive Chunker"]
            Chunker --> Embedder["Transformers.js (EmbeddingGemma 2 768D)"]
            Chunker --> Lexical["MiniSearch BM25 Index"]
            Embedder & Lexical --> LocalDB[("IndexedDB (Dexie.js)")]
        end

        subgraph RAG_Harness ["Small-Model Harness"]
            UserQuery["User Prompt / Question"] --> HybridSearch["Hybrid Search (Dense + BM25 via RRF)"]
            LocalDB --> HybridSearch
            HybridSearch --> ContextPreClean["Context Pre-Cleaning & Budgeting"]
            TaskRouter{"Task Type"}
            HybridSearch --> TaskRouter
            TaskRouter -- "Q&A / Chat" --> DelimitedPrompt["Delimited XML Grounded Prompt"]
            TaskRouter -- "Long Summaries" --> MapReduceEngine["Hierarchical Map-Reduce Engine"]
            TaskRouter -- "Quiz Arena" --> ProgressiveMicroTask["Progressive Micro-Tasking Generator"]
            TaskRouter -- "Flashcards" --> SM2Engine["SM-2 Spaced Repetition Engine"]
        end

        subgraph Execution_Layer ["WebGPU Execution"]
            DelimitedPrompt & MapReduceEngine & ProgressiveMicroTask & SM2Engine --> WorkerThread["Web Worker MLCEngineHandler"]
            WorkerThread --> WebGPU["WebGPU Pipeline (Shader f16)"]
            WebGPU --> CacheStorage[("CacheStorage Model Weights")]
        end

        subgraph UI_Layer ["Interactive React UI"]
            WorkerThread --> StreamingUI["Live Streaming Responses & Citations"]
        end
    end
```

---

## 1. Core Principles

1. **Zero-Backend & Complete Privacy**:
   - No text, embeddings, or prompts leave the client machine.
   - Hostable as a static single-page application on **GitHub Pages**.
2. **Specialized Small-Model Harness**:
   - Small models (0.5B to 4B parameters) running in consumer browser environments possess restricted KV caches and attention budgets.
   - The harness optimizes performance through context pre-cleaning, strict token budgeting, Jaccard deduplication, hierarchical Map-Reduce summarization, progressive single-question quiz generation, and SM-2 flashcard scheduling.
3. **Hybrid Information Retrieval**:
   - Merges dense semantic vector similarity ([`EmbeddingGemma 2`](./models-and-webgpu.md)) with sparse lexical BM25 indexing ([`MiniSearch`](./rag-and-small-model-harness.md)) using Reciprocal Rank Fusion (RRF).
4. **Fluid 60 FPS User Experience**:
   - Heavy neural weight streaming, shader execution, and token generation run off-thread in a dedicated Web Worker ([`src/lib/llm/webllmWorker.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/llm/webllmWorker.ts)).

---

## 2. Key Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite, Tailwind CSS | Reactive, responsive UI with light/dark theme support. |
| **Local LLM Engine** | `@mlc-ai/web-llm` | WebGPU-accelerated in-browser inference for Gemma 4, Qwen 2.5, and Llama 3.2. |
| **Embeddings** | `@huggingface/transformers` | Client-side ONNX feature extraction using EmbeddingGemma 2 (270M) and all-MiniLM-L6-v2. |
| **Lexical Search** | `minisearch` | In-memory BM25 sparse search with fuzzy matching and prefix support. |
| **PDF Extraction** | `pdfjs-dist` | In-browser PDF text and page parsing. |
| **Local Storage** | `dexie` (IndexedDB) | Relational client-side persistence for documents, chunks, vectors, notes, quizzes, and flashcards. |
| **Learning Tools** | Spaced Repetition (SM-2) | Active recall and memory retention scheduling. |
| **Animations** | `canvas-confetti`, `lucide-react` | Celebratory quiz completion interactions and modern iconography. |
| **Deployment** | GitHub Actions (`.github/workflows/deploy.yml`) | Automated static site compilation and deployment to GitHub Pages. |

---

## 3. Related Documentation

- [Quickstart & Developer Guide](./quickstart.md): Step-by-step installation, local dev, and GitHub Pages publishing.
- [RAG Retrieval & Small Model Robustness Harness](./rag-and-small-model-harness.md): In-depth mechanics of RRF hybrid retrieval, context compression, and micro-tasking.
- [WebGPU & In-Browser Model Inference](./models-and-webgpu.md): Specifications for Gemma 4 E2B/E4B, EmbeddingGemma 2 (270M), and WebGPU acceleration.
- [Document Ingestion, Chunking & Client Storage](./ingestion-and-storage.md): PDF parsing, recursive chunking, and IndexedDB data models.
- [UI Architecture & Learning Suite Components](./ui-and-learning-suite.md): Conversational Q&A, split-screen citation viewer, Map-Reduce summaries, smart notes, quiz arena, and SM-2 flashcard arena.
