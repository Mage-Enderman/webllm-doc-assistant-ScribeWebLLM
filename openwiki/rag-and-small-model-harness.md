---
type: concept
title: RAG Retrieval & Small Model Robustness Harness
description: Technical architecture of the Small-Model Harness, featuring Hybrid Dense-BM25 Reciprocal Rank Fusion, context pre-cleaning, strict budgeting, Map-Reduce summarization, and progressive quiz micro-tasking.
tags: [rag, hybrid-search, rrf, minisearch, embeddings, harness, map-reduce]
sources:
  - id: openwiki-source-580abd72d173230c6f842464
    resource: repo://src/components/views/QuizView.tsx
  - id: openwiki-source-88b71ebfa842a6104a8e58ac
    resource: repo://src/components/views/SummaryView.tsx
  - id: openwiki-source-7df12e53aab3187d688433b0
    resource: repo://src/lib/rag/harness.ts
  - id: openwiki-source-fac1b9700e86dde836ccce88
    resource: repo://src/lib/rag/retriever.ts
generated: { by: "antigravity", at: "2026-10-26T10:33:50.945Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T10:46:08.317Z
---

# RAG Retrieval & Small Model Robustness Harness

Running neural language models directly in consumer browsers via WebGPU imposes unique engineering constraints: smaller parameter counts (0.5B to 4B parameters), tighter KV caches, and lower tolerance for noisy, disorganized prompt contexts.

This document details the **Small-Model Harness** ([`src/lib/rag/harness.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/rag/harness.ts)) and **Hybrid Retrieval Engine** ([`src/lib/rag/retriever.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/rag/retriever.ts)) engineered to maximize answer accuracy and eliminate hallucinations in ScribeWebLLM.

---

## 1. Hybrid Retrieval (Dense + BM25 via Reciprocal Rank Fusion)

Pure vector search frequently struggles with exact keywords (such as API identifiers, function names, error codes, and specific numbers), while pure lexical BM25 search misses conceptual synonyms. ScribeWebLLM combines both using **Reciprocal Rank Fusion (RRF)**:

```text
               User Query
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
Dense Semantic Search   BM25 Lexical Search
 (EmbeddingGemma 2)     (MiniSearch Index)
         │                   │
         └─────────┬─────────┘
                   ▼
     Reciprocal Rank Fusion (RRF)
     Score = 1/(60+Rank_dense) + 1/(60+Rank_bm25)
```

### Mathematical Formulation
For each chunk $c \in \mathcal{C}$, its hybrid ranking score is computed as:

$$\text{RRF}(c) = \frac{1}{k + r_{\text{dense}}(c)} + \frac{\mathbb{I}_{\text{BM25}}(c)}{k + r_{\text{BM25}}(c)}$$

Where:
- $k = 60$ is the standard smoothing constant preventing high-rank dominance.
- $r_{\text{dense}}(c)$ is the 1-based rank from dense cosine similarity against the query embedding.
- $r_{\text{BM25}}(c)$ is the 1-based rank from `MiniSearch` full-text search.
- $\mathbb{I}_{\text{BM25}}(c)$ is an indicator function returning $1$ if the chunk was retrieved by BM25, and $0$ otherwise.

---

## 2. Context Pre-Cleaning & Budgeting

Small models can become disoriented when presented with unformatted text dumps containing repeated headers, footers, and redundant passages. The harness implements:

### A. Context Pre-Cleaning (`cleanTextForSmallModel`)
Removes extraneous noise before assembling prompts:
- Strips synthetic page boundary markers (`--- [Page X] ---`).
- Normalizes Windows CRLF to LF.
- Strips isolated numbers, lone punctuation lines, and redundant whitespace.

### B. Jaccard Word-Overlap Deduplication (`deduplicateChunks`)
Compares candidate chunks pairwise using Jaccard word similarity:
- If $\frac{|A \cap B|}{\min(|A|, |B|)} > 0.65$, the redundant chunk is dropped.
- Preserves maximum informational diversity within the context window.

### C. Strict Context Budgeting (`assembleContextForPrompt`)
Enforces strict token ceilings to guarantee sufficient generation headroom:
- **Maximum Context Tokens**: 2,400 tokens.
- **Reserved Output Headroom**: 750 tokens.
- System prompt and conversation history budgets are subtracted first, packing only high-signal chunks up to the remaining allowance.

---

## 3. Hierarchical Map-Reduce Summarization

When a user requests an executive summary of a 50+ page document, the document's total token count exceeds the model's single-turn context window. The harness provides a multi-stage **Map-Reduce pipeline**:

1. **Map Stage**:
   - Groups chunks into small batches of 3 chunks (~600 tokens).
   - Generates 3 concise, high-value bullet points per batch using `buildChunkBatchSummaryPrompt` / `buildBatchSummaryPrompt`.
   - Displays real-time batch progress in the user interface (`Batch X / Y`).
2. **Reduce Stage**:
   - Consolidates all intermediate bullet summaries into a single synthesis prompt using `buildFinalSummaryPrompt`.
   - The model generates a clean, structured output containing:
     - **TL;DR**: 2-sentence rapid overview.
     - **Executive Summary**: 2-paragraph cohesive explanation.
     - **Core Highlights**: Bulleted list of critical takeaways.

---

## 4. Progressive Micro-Tasking Quiz Harness

Generating a multi-question quiz in a single monolithic JSON output often causes small models to experience output fatigue, leading to dropped options (e.g. producing only 2 options instead of 4) or phantom option references in explanations.

ScribeWebLLM employs **Progressive Micro-Tasking**:
- Spatially samples $N$ distinct concept chunks evenly across the document.
- Invokes the model sequentially for each chunk with `buildSingleQuestionPrompt`, generating **one question at a time** with a 450-token output limit.
- **Parser Enforcement (`parseSingleQuizQuestion`)**:
  - Automatically deduplicates near-identical options.
  - Guarantees exactly 4 distinct choices (A, B, C, D) by supplying contextual distractors if the model under-generates.
  - Automatically resolves `correctIndex` from numerical indices, text matches, or letter choices (`A`, `B`, `C`, `D`).
  - Cleans explanations to remove references to phantom options.
