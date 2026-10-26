import { ChunkItem, ChunkMetadata } from '../types';

export interface ChunkOptions {
  chunkSize?: number; // target character count (default 600)
  chunkOverlap?: number; // character overlap (default 100)
  minChunkSize?: number; // minimum chunk length (default 100)
}

/**
 * Approximate token count (~4 characters per token in English)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().split(/\s+/).length * 1.3);
}

/**
 * Splits text recursively by paragraph, then sentences, then whitespace.
 */
export function splitTextIntoChunks(
  fullText: string,
  docId: string,
  docTitle: string,
  options: ChunkOptions = {},
  pageNumber?: number
): ChunkItem[] {
  const { chunkSize = 600, chunkOverlap = 100, minChunkSize = 80 } = options;

  if (!fullText || fullText.trim().length === 0) {
    return [];
  }

  const rawParagraphs = fullText.split(/\n\s*\n/);
  const chunks: ChunkItem[] = [];

  let currentChunk = '';
  let currentStartChar = 0;
  let runningCharOffset = 0;

  for (const para of rawParagraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If adding this paragraph fits comfortably
    if ((currentChunk + '\n\n' + trimmedPara).trim().length <= chunkSize) {
      if (currentChunk.length === 0) {
        currentStartChar = runningCharOffset;
      }
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
    } else {
      // If the paragraph itself is huge, split by sentences
      if (trimmedPara.length > chunkSize) {
        // Flush previous chunk if any
        if (currentChunk.length >= minChunkSize) {
          chunks.push(
            createChunkItem(
              currentChunk,
              docId,
              docTitle,
              chunks.length,
              currentStartChar,
              pageNumber
            )
          );
          currentChunk = '';
        }

        const sentences = trimmedPara.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [trimmedPara];
        let subChunk = '';
        let subStart = runningCharOffset;

        for (const sentence of sentences) {
          if ((subChunk + ' ' + sentence).trim().length <= chunkSize) {
            subChunk = subChunk ? `${subChunk} ${sentence.trim()}` : sentence.trim();
          } else {
            if (subChunk.length >= minChunkSize) {
              chunks.push(
                createChunkItem(
                  subChunk,
                  docId,
                  docTitle,
                  chunks.length,
                  subStart,
                  pageNumber
                )
              );
              // Maintain overlap
              const overlapText = subChunk.slice(-chunkOverlap);
              subChunk = `${overlapText} ${sentence.trim()}`.trim();
              subStart += subChunk.length - overlapText.length;
            } else {
              subChunk = sentence.trim();
            }
          }
        }

        if (subChunk.trim().length >= minChunkSize) {
          chunks.push(
            createChunkItem(
              subChunk.trim(),
              docId,
              docTitle,
              chunks.length,
              subStart,
              pageNumber
            )
          );
        }
      } else {
        // Normal paragraph flush
        if (currentChunk.length >= minChunkSize) {
          chunks.push(
            createChunkItem(
              currentChunk,
              docId,
              docTitle,
              chunks.length,
              currentStartChar,
              pageNumber
            )
          );
          const overlap = currentChunk.slice(-chunkOverlap);
          currentChunk = `${overlap}\n\n${trimmedPara}`.trim();
          currentStartChar = runningCharOffset - overlap.length;
        } else {
          currentChunk = trimmedPara;
          currentStartChar = runningCharOffset;
        }
      }
    }

    runningCharOffset += para.length + 2;
  }

  // Final flush
  if (currentChunk.trim().length >= minChunkSize) {
    chunks.push(
      createChunkItem(
        currentChunk.trim(),
        docId,
        docTitle,
        chunks.length,
        currentStartChar,
        pageNumber
      )
    );
  }

  return chunks;
}

function createChunkItem(
  text: string,
  docId: string,
  docTitle: string,
  index: number,
  startChar: number,
  page?: number
): ChunkItem {
  const metadata: ChunkMetadata = {
    startChar,
    endChar: startChar + text.length,
    page,
  };

  return {
    id: `${docId}_chunk_${index}`,
    docId,
    docTitle,
    chunkIndex: index,
    text,
    tokenEstimate: estimateTokens(text),
    metadata,
  };
}
