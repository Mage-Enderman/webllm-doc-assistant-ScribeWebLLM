import { pipeline, env } from '@huggingface/transformers';

// Configure transformers for browser environment
env.allowLocalModels = false;

let extractorInstance: any = null;
let extractorPromise: Promise<any> | null = null;

export async function getEmbeddingPipeline(
  onProgress?: (progress: number, text: string) => void
): Promise<any> {
  if (extractorInstance) {
    return extractorInstance;
  }
  if (extractorPromise) {
    return extractorPromise;
  }

  extractorPromise = (async () => {
    try {
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (item: any) => {
          if (item && item.progress !== undefined && onProgress) {
            onProgress(item.progress / 100, item.file || 'Downloading embedding model...');
          }
        },
      });
      extractorInstance = extractor;
      return extractor;
    } catch (err) {
      console.warn('Could not initialize transformers pipeline:', err);
      throw err;
    }
  })();

  return extractorPromise;
}

/**
 * Generate a 384-dimensional dense embedding vector for a piece of text.
 */
export async function generateEmbedding(
  text: string,
  onProgress?: (progress: number, text: string) => void
): Promise<number[]> {
  try {
    const extractor = await getEmbeddingPipeline(onProgress);
    const output = await extractor(text.slice(0, 1000), {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data);
  } catch (error) {
    console.warn('Using deterministic vectorizer fallback:', error);
    return generateFallbackEmbedding(text);
  }
}

/**
 * Batch generate embeddings
 */
export async function generateBatchEmbeddings(
  texts: string[],
  onBatchProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = await generateEmbedding(texts[i]);
    embeddings.push(emb);
    if (onBatchProgress) {
      onBatchProgress(i + 1, texts.length);
    }
  }
  return embeddings;
}

/**
 * Computes cosine similarity between two normalized vectors.
 * Because normalized vectors have magnitude 1, cosine similarity = dot product.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

/**
 * Lightweight deterministic n-gram hashing vectorizer fallback (384 dimensions)
 * used if Transformers.js is temporarily unavailable or in unsupported test environments.
 */
export function generateFallbackEmbedding(text: string): number[] {
  const dim = 384;
  const vector = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  
  if (words.length === 0) return vector;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vector[idx] += 1;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}
