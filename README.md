# 🧠 DocuBrain AI — In-Browser WebLLM Learning Assistant

> **Private, 100% In-Browser Documentation Learning Assistant powered by WebGPU, WebLLM, and Client-Side Hybrid RAG.**  
> Hostable directly as a static **GitHub Page** with **zero backend server or API keys required**.

Inspired by [rimc008/Rag_project2](https://github.com/rimc008/Rag_project2), DocuBrain AI elevates the document learning workflow into a pure client-side experience: your documents, embeddings, and language model execute entirely inside your browser's WebGPU sandbox. No document content or queries ever leave your machine.

---

## ✨ Features

- 💬 **Grounded Conversational Chat (Q&A)**: Streaming answers with verifiable source citation badges indicating the exact document chunk and page number.
- 📑 **Hierarchical AI Summarizer (Map-Reduce)**: Summarizes lengthy 50+ page documents using a batching Map-Reduce harness specifically designed for small browser models without context overflow.
- 📚 **Smart Study Notes**: Automatically extracts Key Concepts, Definitions, Actionable Takeaways, and Review Questions into formatted study cards with Markdown export.
- 🎯 **Interactive Quiz Arena**: Generates 3, 5, or 10 question multiple-choice quizzes with instant answer validation, comprehensive explanations, score tallying, and celebratory confetti.
- 🔍 **RAG Chunk & Embedding Inspector**: Transparently inspect document chunking, token estimates, 384-dimensional vector status, and live hybrid retrieval scores.
- ⚡ **Local Knowledge Base**: Ingest PDF documents (parsed locally with PDF.js), Markdown notes, plain text files, or paste notes directly. All data persists permanently on device via IndexedDB.
- 🌙 **Dark & Light Mode**: Clean, responsive interface styled with Tailwind CSS.

---

## 🛠️ The Small-Model Harness Architecture

Small models running in browser WebGPU memory (0.5B to 3B parameters like `Qwen2.5-0.5B`, `Llama-3.2-1B`, or `SmolLM2-1.7B`) have tight context limits and can easily suffer from distraction or hallucination if context is assembled poorly.

DocuBrain AI incorporates a specialized **Small-Model Harness**:

```
                  User Query / Task
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   Dense Semantic Search           Sparse Keyword Search
 (Transformers.js all-MiniLM)        (MiniSearch BM25)
         │                                 │
         └────────────────┬────────────────┘
                          ▼
            Reciprocal Rank Fusion (RRF)
                          │
                          ▼
             Chunk Deduplication & Jaccard
                          │
                          ▼
              Strict Context Budgeting
       (Reserving 600-800 tokens for generation)
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
  Single-Turn Task               Whole-Doc Summary Task
 (Chat Q&A / Quiz)              (Hierarchical Map-Reduce)
         │                                 │
         ▼                                 ▼
Delimited XML/Markdown Guardrails   Batch 1..N Chunk Summaries
         │                                 │
         ▼                                 ▼
 WebLLM WebGPU WebWorker Engine     Final Synthesis Reduce
         │                                 │
         └────────────────┬────────────────┘
                          ▼
                Streaming Output to UI
```

1. **Hybrid Retrieval (Dense + BM25 via RRF)**:
   - Dense embeddings computed in browser via `@xenova/transformers` (`all-MiniLM-L6-v2`).
   - Sparse lexical search via `minisearch`.
   - Merged with Reciprocal Rank Fusion: $\text{RRF Score} = \frac{1}{60 + \text{Rank}_{\text{dense}}} + \frac{1}{60 + \text{Rank}_{\text{BM25}}}$.
2. **Context Deduplication & Budgeting**:
   - Prunes semantically redundant passages using Jaccard word-overlap filtering.
   - Enforces strict token ceilings to guarantee room for model output.
3. **Hierarchical Map-Reduce**:
   - Batches long documents into manageable chunk groups, generates intermediate summaries, and synthesizes them into an executive summary without overflowing context limits.
4. **Delimited Prompting**:
   - Explicit guardrails prevent hallucinations by directing the model to cite specific sources or acknowledge missing context.
5. **Web Worker Isolation**:
   - WebLLM runs in a dedicated Web Worker (`WebWorkerMLCEngine`) so token generation never blocks the UI thread (60 FPS responsiveness).

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+)
- A modern browser with WebGPU support (Google Chrome 113+, Microsoft Edge 113+, or latest Safari/Firefox).

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/webllm-rag.git
cd webllm-rag

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🌐 Deploying to GitHub Pages

This app is 100% static client-side and includes a pre-configured GitHub Actions workflow.

1. Create a repository on GitHub and push this code to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of DocuBrain AI"
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Push any commit to `main`, and the included `.github/workflows/deploy.yml` workflow will automatically build and publish your site!

---

## 🧠 Supported WebLLM Models

| Model | Parameters | Download Size | Recommended Device |
| :--- | :--- | :--- | :--- |
| **Qwen 2.5 (0.5B)** *(Default)* | 0.5 Billion | ~380 MB | Any laptop, tablet, or phone |
| **Llama 3.2 (1B)** | 1.2 Billion | ~880 MB | Standard laptops & desktops |
| **Qwen 2.5 (1.5B)** | 1.5 Billion | ~1.2 GB | Modern laptops with dedicated/integrated GPU |
| **SmolLM2 (1.7B)** | 1.7 Billion | ~1.3 GB | High instruction precision |
| **Llama 3.2 (3B)** | 3.2 Billion | ~2.2 GB | Desktops or laptops with 4GB+ VRAM |

*Note: Models are downloaded once and cached in your browser's `CacheStorage`. Subsequent visits start immediately without re-downloading.*

---

## 📜 Credits & License

- Inspired by [rimc008/Rag_project2](https://github.com/rimc008/Rag_project2) by Roman Chakraborty.
- Built with [WebLLM](https://webllm.mlc.ai/) by MLC-AI, [Transformers.js](https://huggingface.co/docs/transformers.js) by Hugging Face, [MiniSearch](https://lucaong.github.io/minisearch/), and [PDF.js](https://mozilla.github.io/pdf.js/).
- Licensed under the MIT License.
