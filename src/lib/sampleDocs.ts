export interface SampleDoc {
  title: string;
  type: 'markdown' | 'text';
  content: string;
}

export const SAMPLE_DOCUMENTS: SampleDoc[] = [
  {
    title: 'AI & Retrieval-Augmented Generation (RAG) Handbook.md',
    type: 'markdown',
    content: `# Complete Guide to Retrieval-Augmented Generation (RAG)

## 1. What is RAG?
Retrieval-Augmented Generation (RAG) is an AI architectural pattern that enhances the output of Large Language Models (LLMs) by referencing an authoritative knowledge base outside of its training data before generating a response. 

Standard LLMs suffer from three main problems:
1. **Knowledge Cutoffs**: They cannot know information created after their training cutoff date.
2. **Hallucinations**: When unsure, they may generate plausible-sounding but factually incorrect statements.
3. **Lack of Proprietary Knowledge**: They have no access to private enterprise or personal notes without fine-tuning.

RAG solves these problems by retrieving relevant documents from an external storage and feeding them into the model's context window alongside the user prompt.

## 2. The Core RAG Pipeline

A standard production RAG pipeline consists of three sequential phases:

### Phase A: Ingestion & Indexing
1. **Document Loading**: Extracting raw text from various sources like PDFs, Markdown files, HTML web pages, and databases.
2. **Chunking**: Splitting lengthy text into smaller, overlapping segments (typically 300 to 1,000 characters). Overlap ensures that semantic thoughts are not severed at arbitrary boundaries.
3. **Embedding Generation**: Passing text chunks through an embedding model (such as all-MiniLM-L6-v2 or text-embedding-3-small) to produce high-dimensional dense vectors (e.g., 384 or 1536 dimensions).
4. **Vector Storage**: Storing these vector embeddings in a vector database or client-side index (such as Qdrant, Chroma, or IndexedDB) with metadata.

### Phase B: Retrieval
1. **Query Embedding**: The user's prompt or question is transformed into the same vector space using the embedding model.
2. **Hybrid Search**: Combining dense vector similarity (cosine similarity for semantic concept matching) and sparse lexical search (BM25 for exact keyword matching).
3. **Reciprocal Rank Fusion (RRF)**: Merging the rankings from both dense and sparse retrieval algorithms to prevent bias.
4. **Context Deduplication & Budgeting**: Filtering out redundant passages and packing the top results within the model's token limits.

### Phase C: Generation
1. **Prompt Construction**: Wrapping the retrieved chunks inside structured delimiters like \`[Documentation Context] ... [/Documentation Context]\`.
2. **Inference**: Passing the prompt to the language model (such as Qwen 2.5 or Llama 3.2).
3. **Source Attribution**: The model cites which chunk or page was used to answer each part of the query.

## 3. Harnessing Small Models (0.5B to 3B Parameters)
Running models directly inside a web browser using WebGPU requires specialized design patterns:
- **Strict Token Limits**: Browser models have smaller KV caches. The prompt assembly must strictly guard against token overflow.
- **Hierarchical Map-Reduce**: When summarizing long documents, a small model cannot digest 20 chunks simultaneously. Instead, summarize in batches of 3-4 chunks, and then synthesize the intermediate summaries into an executive report.
- **Explicit Negative Constraints**: Instruct the model: "If the context does not contain the answer, say so explicitly." Small models adhere closely when given clear guardrails.
`,
  },
  {
    title: 'Quantum Computing & Qubits 101.md',
    type: 'markdown',
    content: `# Introduction to Quantum Computing & Superposition

## 1. Classical Bits vs. Quantum Qubits
In classical computers, the fundamental unit of information is a bit, which exists strictly as a 0 or a 1. Classical logic gates like AND, OR, and NOT manipulate these discrete electrical voltages.

In quantum computing, the fundamental unit of information is the **qubit** (quantum bit). A qubit can exist in a state of 0, 1, or any quantum superposition of both states simultaneously until it is measured.

## 2. Foundational Quantum Principles

### A. Superposition
Superposition allows a quantum system to be described by a linear combination of basis states:
|ψ⟩ = α|0⟩ + β|1⟩, where |α|² + |β|² = 1.
Here, |α|² represents the probability of measuring state 0, and |β|² represents the probability of measuring state 1. This property allows quantum computers to evaluate exponential combinations of computational paths at the same time.

### B. Quantum Entanglement
Entanglement is a phenomenon where two or more qubits become interconnected such that the quantum state of each qubit cannot be described independently of the state of the others, regardless of distance. Albert Einstein famously referred to this as "spooky action at a distance."

### C. Quantum Interference
Quantum algorithms (like Shor's algorithm for factoring and Grover's search algorithm) use quantum interference. By manipulating probability amplitudes, constructive interference amplifies correct computational answers while destructive interference cancels out incorrect ones.

## 3. Applications of Quantum Computing
1. **Cryptography**: Factoring large primes via Shor's algorithm, prompting the global development of Post-Quantum Cryptography (PQC).
2. **Molecular Simulation**: Designing catalysts, batteries, and pharmaceuticals by simulating complex molecular bonds that classical supercomputers cannot model.
3. **Optimization**: Solving complex logistics, portfolio risk, and supply chain bottlenecks faster using Quantum Approximate Optimization Algorithms (QAOA).
`,
  },
];
