---
type: concept
title: User Interface & Interactive Learning Suite
description: Detailed guide to the five interactive view modes (Chat, Summaries, Notes, Quiz Arena, and Chunk Inspector), UI layout, and automated GitHub Pages deployment.
tags: [ui, react, tailwind, chat, quiz, summary, notes, inspector, github-pages]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T09:17:38.820Z
sources:
  - id: openwiki-source-6766b7a0c14857435d2077c9
    resource: repo://.github/workflows/deploy.yml
  - id: openwiki-source-b5f74174de8f511bd0137acc
    resource: repo://src/components/views/ChatView.tsx
  - id: openwiki-source-4bbd5f70675da13d8c3bd2f1
    resource: repo://src/components/views/InspectorView.tsx
  - id: openwiki-source-580abd72d173230c6f842464
    resource: repo://src/components/views/QuizView.tsx
  - id: openwiki-source-5e1b077422a94ae165e88e4e
    resource: repo://vite.config.ts
generated: { by: "antigravity", at: "2026-10-26T09:17:38.820Z" }
---

# User Interface & Interactive Learning Suite

DocuBrain AI organizes document interactions into five specialized views, complemented by a persistent knowledge base sidebar, dynamic model management banner, and automated GitHub Pages deployment.

---

## 1. Top-Level Layout & Navigation

The application shell ([`src/App.tsx`](file:///E:/0-Antigravity/0-webllm/src/App.tsx)) coordinates four major interface regions:
1. **Header ([`src/components/Header.tsx`](file:///E:/0-Antigravity/0-webllm/src/components/Header.tsx))**:
   - WebGPU hardware indicator (Active / Missing).
   - Embedding model dropdown (`EmbeddingGemma 2 768D` vs. `all-MiniLM 384D`).
   - Language model selector (`Qwen 2.5`, `Gemma 4 E2B/E4B`, `Llama 3.2`, `SmolLM2`).
   - Model initialization trigger button with live pulse animation.
   - Light/Dark theme toggle button.
2. **Model Status Banner ([`src/components/ModelStatusBanner.tsx`](file:///E:/0-Antigravity/0-webllm/src/components/ModelStatusBanner.tsx))**:
   - Renders animated progress bar during weight downloading and shader compilation.
   - Explains CacheStorage persistence to reassure users regarding network efficiency.
3. **Knowledge Base Sidebar ([`src/components/Sidebar.tsx`](file:///E:/0-Antigravity/0-webllm/src/components/Sidebar.tsx))**:
   - Drag & drop ingestion zone supporting `.pdf`, `.md`, and `.txt`.
   - "+ Paste Note" modal for custom text or code snippets.
   - 1-click sample document loader.
   - Document search filter and per-document deletion.
   - Query scope toggle: query all documents or isolate queries to a selected document.
4. **Navigation Tabs ([`src/components/NavigationTabs.tsx`](file:///E:/0-Antigravity/0-webllm/src/components/NavigationTabs.tsx))**:
   - Switches between the five primary views below.

---

## 2. Interactive Learning Suite Views

### A. Conversational Grounded Chat (`ChatView.tsx`)
- **Streaming Output**: Token-by-token streaming powered by WebLLM's `streamChat`.
- **Grounded Source Attribution**: Every answer renders clickable citation badges (`Source 1 (p.2)`).
- **Citation Inspection Modal**: Clicking any citation opens a modal displaying the exact raw chunk text snippet and its composite RRF score.
- **Prompt Acceleration Chips**: Built-in prompts ("Summarize the main architectural flow", "What are the limitations?") to jumpstart inquiry.

### B. Hierarchical AI Summaries (`SummaryView.tsx`)
- **Multi-Depth Synthesis**: Generates a 2-sentence TL;DR, 2-paragraph Executive Summary, and bulleted Core Highlights.
- **Live Map-Reduce Visualizer**: Renders progress through intermediate batch extraction (`Batch X / Y`) before final reduction.
- **Export Capabilities**: 1-click clipboard copy and `.md` file download.

### C. Smart Study Notes (`NotesView.tsx`)
- **Structured Concept Extraction**: Automatically formats content into Core Concepts (term + definition), Essential Takeaways, and Review Questions.
- **Exporting**: Supports direct export to study-ready Markdown files.

### D. Interactive Quiz Arena (`QuizView.tsx`)
- **Configurable Tests**: Generate 3, 5, or 10 question multiple-choice quizzes.
- **Progressive Micro-Tasking**: Generates questions incrementally with visual progress bar updates.
- **Guaranteed 4 Options**: Every question provides exactly 4 choices (A, B, C, D) with distinct alternatives.
- **Instant Visual Feedback**: Options turn green upon correct selection or red upon incorrect selection, revealing an immediate explanation box.
- **Celebration Confetti**: Triggers dynamic canvas confetti upon correct answers and final quiz completion with accuracy percentage.

### E. RAG Chunk Inspector (`InspectorView.tsx`)
- **Transparency Sandbox**: View total document count, indexed chunk counts, vector dimensions (768D vs 384D), and lexical engine metrics.
- **Live Hybrid Retrieval Simulator**: Enter test queries to simulate RRF fusion scores, dense similarity, and BM25 rankings side-by-side.
- **Raw Chunk Explorer**: Inspect every chunk's text, token estimates, and embedding vector status.

---

## 3. GitHub Pages Deployment (`.github/workflows/deploy.yml`)

Because DocuBrain AI is 100% client-side, it is deployed as a static Single Page Application (SPA):
- **Relative Base Path**: `vite.config.ts` sets `base: './'` so all JavaScript, CSS, and WebAssembly assets resolve cleanly under GitHub Pages repository paths (`https://<username>.github.io/<repo>/`).
- **ES Module Worker**: `worker: { format: 'es' }` preserves module import capabilities in the WebLLM Web Worker.
- **Automated GitHub Actions Workflow**:
  - Triggers automatically on push to `main` branch.
  - Installs dependencies (`npm ci`), runs the TypeScript build (`npm run build`), uploads the `./dist` artifact, and deploys directly to GitHub Pages.
