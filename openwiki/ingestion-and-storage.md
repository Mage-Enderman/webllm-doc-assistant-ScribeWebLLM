---
type: architecture
title: Document Ingestion & Local Storage
description: Client-side document processing pipeline covering PDF parsing with PDF.js, recursive text chunking with overlap, and IndexedDB local storage using Dexie.
tags: [ingestion, pdf, chunking, indexeddb, dexie, storage]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T09:17:38.820Z
sources:
  - id: openwiki-source-1f2b19471bdc39ae43870944
    resource: repo://src/lib/db.ts
  - id: openwiki-source-a3abce0da8ddb89905d38ba4
    resource: repo://src/lib/ingestion/documentProcessor.ts
  - id: openwiki-source-057e4e6ef94e3c199774cce9
    resource: repo://src/lib/rag/chunker.ts
generated: { by: "antigravity", at: "2026-10-26T09:17:38.820Z" }
---

# Document Ingestion & Local Storage

This document details the document ingestion lifecycle, client-side PDF parsing, text chunking mechanics, and persistent IndexedDB storage architecture in DocuBrain AI.

---

## 1. Document Ingestion Lifecycle

DocuBrain AI processes documents 100% locally in the browser with zero server roundtrips. The processing pipeline is managed by `processAndIngestDocument` in [`src/lib/ingestion/documentProcessor.ts`](file:///E:/0-Antigravity/0-webllm/src/lib/ingestion/documentProcessor.ts).

```text
[User File / Note] ──> [Text Extraction] ──> [Recursive Chunker] ──> [Batch Embeddings] ──> [IndexedDB Put]
                          (PDF.js / Text)      (Paragraph/Sentence)    (EmbeddingGemma 2)     (Dexie Tables)
```

The pipeline emits structured progress updates through the `IngestionProgress` interface across four sequential stages:
1. **Reading (`reading`)**: Reading ArrayBuffer or text payload and extracting raw content.
2. **Chunking (`chunking`)**: Breaking text into semantic segments with overlap and token estimation.
3. **Embedding (`embedding`)**: Computing dense embeddings for each chunk via Transformers.js.
4. **Saving (`saving`)**: Bulk writing documents and chunks to IndexedDB and registering chunks in the active `HybridRetriever`.

---

## 2. In-Browser PDF Parsing (`pdfjs-dist`)

PDF documents are extracted directly in the client without external services using Mozilla's `pdfjs-dist`:
- **Worker Configuration**: The worker script is configured via CDN fallback (`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`) in `documentProcessor.ts`.
- **Page-by-Page Extraction**: `extractTextFromPDF` iterates sequentially across pages from $1$ to `pdf.numPages`:
  - Retrieves each page via `pdf.getPage(i)`.
  - Extracts text items via `page.getTextContent()`.
  - Joins text fragments and injects identifiable page boundary markers (`--- [Page X] ---`).
  - Reports incremental percentage progress to the user interface.

---

## 3. Recursive Character Chunking (`src/lib/rag/chunker.ts`)

Chunking decomposes continuous document prose into discrete, manageable segments optimized for small language model context budgets:
- **Default Parameters**:
  - `chunkSize`: 600 characters (~150 tokens)
  - `chunkOverlap`: 100 characters (~25 tokens)
  - `minChunkSize`: 80 characters
- **Hierarchy of Splitting**:
  1. Splitting by paragraphs (`\n\s*\n`).
  2. If a paragraph exceeds `chunkSize`, splitting by sentence boundaries (`[.!?]+(\s+|$)`).
  3. Preserving sliding overlap across boundaries to prevent truncating continuous thoughts.
- **Token Estimation**: Estimated using English word-count heuristics ($1.3 \times \text{words}$).
- **Chunk Metadata**: Every chunk preserves its `docId`, `chunkIndex`, `metadata.page`, `metadata.startChar`, and `metadata.endChar`.

---

## 4. IndexedDB Database Schema (`src/lib/db.ts`)

DocuBrain AI uses Dexie.js to interface with the browser's native IndexedDB (`DocuBrainDB`, Version 1):

| Table | Primary Key | Indexed Fields | Purpose |
| :--- | :--- | :--- | :--- |
| `documents` | `id` | `title`, `type`, `createdAt` | Document metadata, full raw content, size, and page count |
| `chunks` | `id` | `docId`, `chunkIndex` | Text chunks, token estimates, 768D/384D embedding vectors, metadata |
| `messages` | `id` | `role`, `timestamp` | Conversational Q&A chat history and grounded citations |
| `quizzes` | `id` | `docId`, `createdAt` | Generated quiz questions, user answers, and score tracking |
| `notes` | `id` | `docId`, `createdAt` | Structured concept notes, key takeaways, and review questions |
| `summaries` | `id` | `docId`, `createdAt` | Multi-depth summaries and section breakdowns |

### Lifecycle Operations
- **Atomic Document Deletion (`deleteDocumentWithChunks`)**: Deletes the document and all associated chunks, quizzes, notes, and summaries in a single transaction.
- **Full Database Purge (`clearAllData`)**: Completely flushes all tables across the active database.

---

## 5. Built-in Sample Documents (`src/lib/sampleDocs.ts`)

To enable immediate testing without uploading files, DocuBrain AI bundles pre-configured educational guides:
1. **AI & Retrieval-Augmented Generation (RAG) Handbook**: Technical deep-dive covering RAG phases (ingestion, retrieval, generation), hybrid search, and small model harnesses.
2. **Quantum Computing & Qubits 101**: Fundamental concepts explaining superposition, quantum entanglement, and practical applications.
