---
okf_version: "0.2"
---

# Files

- [Document Ingestion, Chunking & Client Storage](ingestion-and-storage.md) - Client-side document processing pipeline covering PDF parsing with PDF.js, recursive text chunking with overlap, and IndexedDB local storage using Dexie.
- [WebGPU & In-Browser Model Inference](models-and-webgpu.md) - Technical architecture for in-browser WebGPU execution via WebLLM, model caching, Google DeepMind Gemma 4 E2B/E4B, and EmbeddingGemma 2 270M vector embeddings.
- [System Overview & Architecture](overview.md) - Architectural overview of ScribeWebLLM, a 100% in-browser, privacy-first documentation and learning assistant powered by WebGPU, WebLLM, and client-side RAG.
- [Quickstart & Developer Guide](quickstart.md) - Quickstart tutorial for launching ScribeWebLLM locally with Vite and deploying to GitHub Pages with GitHub Actions.
- [RAG Retrieval & Small Model Robustness Harness](rag-and-small-model-harness.md) - Technical architecture of the Small-Model Harness, featuring Hybrid Dense-BM25 Reciprocal Rank Fusion, context pre-cleaning, strict budgeting, Map-Reduce summarization, and progressive quiz micro-tasking.
- [UI Architecture & Learning Suite Components](ui-and-learning-suite.md) - Detailed guide to the interactive learning views (Chat, Summaries, Notes, Quiz Arena, Flashcards SM-2 Arena, and Chunk Inspector), DocumentViewer split-screen, and automated GitHub Pages deployment.
