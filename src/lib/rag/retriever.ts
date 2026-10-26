import MiniSearch from 'minisearch';
import { ChunkItem, SearchResult } from '../types';
import { cosineSimilarity, generateEmbedding } from './embeddings';

export interface RetrievalOptions {
  topK?: number;
  minScore?: number;
  docIdFilter?: string | string[];
  docIdsFilter?: string[];
  rrfK?: number; // constant for RRF (default 60)
  alpha?: number; // weighting between dense (alpha) and sparse (1 - alpha)
}

export class HybridRetriever {
  private miniSearch: MiniSearch<ChunkItem>;
  private chunks: ChunkItem[] = [];

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['text', 'docTitle'], // fields to index for full-text search
      storeFields: ['id', 'docId', 'docTitle', 'chunkIndex', 'text', 'tokenEstimate', 'metadata'],
      searchOptions: {
        boost: { docTitle: 1.5, text: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  /**
   * Index or re-index a set of chunks
   */
  public setChunks(chunks: ChunkItem[]) {
    this.chunks = chunks;
    this.miniSearch.removeAll();
    if (chunks.length > 0) {
      this.miniSearch.addAll(chunks);
    }
  }

  /**
   * Add new chunks incrementally
   */
  public addChunks(newChunks: ChunkItem[]) {
    this.chunks.push(...newChunks);
    this.miniSearch.addAll(newChunks);
  }

  /**
   * Remove chunks for a specific document or list of documents
   */
  public removeDocChunks(docId: string | string[]) {
    const ids = Array.isArray(docId) ? docId : [docId];
    const idSet = new Set(ids);
    const toRemove = this.chunks.filter((c) => idSet.has(c.docId));
    this.chunks = this.chunks.filter((c) => !idSet.has(c.docId));
    if (toRemove.length > 0) {
      this.miniSearch.discardAll(toRemove.map((c) => c.id));
    }
  }

  /**
   * Execute Hybrid Search: Dense Cosine Similarity + BM25 Lexical with Reciprocal Rank Fusion
   */
  public async search(query: string, options: RetrievalOptions = {}): Promise<SearchResult[]> {
    const { topK = 5, docIdFilter, docIdsFilter, rrfK = 60 } = options;

    if (!query || query.trim().length === 0 || this.chunks.length === 0) {
      return [];
    }

    // Determine target documents for filtering
    const targetDocIds: string[] = [];
    if (docIdsFilter && docIdsFilter.length > 0) {
      targetDocIds.push(...docIdsFilter);
    }
    if (docIdFilter) {
      if (Array.isArray(docIdFilter)) {
        targetDocIds.push(...docIdFilter);
      } else {
        targetDocIds.push(docIdFilter);
      }
    }

    const hasDocFilter = targetDocIds.length > 0;
    const filterSet = new Set(targetDocIds);

    // Filter available chunks if document filter is specified
    const activeChunks = hasDocFilter
      ? this.chunks.filter((c) => filterSet.has(c.docId))
      : this.chunks;

    if (activeChunks.length === 0) return [];

    // 1. BM25 Sparse Search via MiniSearch
    let bm25Results = this.miniSearch.search(query, {
      filter: hasDocFilter ? (result) => filterSet.has(result.docId) : undefined,
    });
    // Map BM25 ranking (1-based rank)
    const bm25RankMap = new Map<string, number>();
    bm25Results.forEach((res, index) => {
      bm25RankMap.set(res.id, index + 1);
    });

    // 2. Dense Semantic Search via Vector Embeddings
    const queryVector = await generateEmbedding(query, { isQuery: true });
    const denseScores: { chunk: ChunkItem; score: number }[] = [];

    for (const chunk of activeChunks) {
      if (chunk.embedding && chunk.embedding.length > 0) {
        const sim = cosineSimilarity(queryVector, chunk.embedding);
        denseScores.push({ chunk, score: sim });
      } else {
        denseScores.push({ chunk, score: 0 });
      }
    }

    // Sort dense results descending
    denseScores.sort((a, b) => b.score - a.score);
    const denseRankMap = new Map<string, number>();
    const denseScoreMap = new Map<string, number>();
    denseScores.forEach((item, index) => {
      denseRankMap.set(item.chunk.id, index + 1);
      denseScoreMap.set(item.chunk.id, item.score);
    });

    // 3. Reciprocal Rank Fusion (RRF)
    const combinedScores = new Map<string, { chunk: ChunkItem; rrfScore: number; denseScore: number; bm25Score: number }>();

    for (const chunk of activeChunks) {
      const denseRank = denseRankMap.get(chunk.id) ?? (activeChunks.length + 10);
      const bm25Rank = bm25RankMap.get(chunk.id) ?? (activeChunks.length + 10);

      const rrfDense = 1 / (rrfK + denseRank);
      const rrfBm25 = bm25RankMap.has(chunk.id) ? 1 / (rrfK + bm25Rank) : 0;
      const totalRrf = rrfDense + rrfBm25;

      combinedScores.set(chunk.id, {
        chunk,
        rrfScore: totalRrf,
        denseScore: denseScoreMap.get(chunk.id) || 0,
        bm25Score: bm25RankMap.has(chunk.id) ? (1 / bm25Rank) : 0,
      });
    }

    // Sort by final RRF score descending
    const sorted = Array.from(combinedScores.values()).sort((a, b) => b.rrfScore - a.rrfScore);

    return sorted.slice(0, topK).map((item) => ({
      chunk: item.chunk,
      score: item.rrfScore,
      denseScore: item.denseScore,
      bm25Score: item.bm25Score,
    }));
  }
}

export const globalRetriever = new HybridRetriever();
