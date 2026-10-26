import * as pdfjsLib from 'pdfjs-dist';
import { db } from '../db';
import { ChunkItem, DocumentItem, DocumentType } from '../types';
import { splitTextIntoChunks } from '../rag/chunker';
import { generateBatchEmbeddings } from '../rag/embeddings';
import { globalRetriever } from '../rag/retriever';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export interface IngestionProgress {
  stage: 'reading' | 'chunking' | 'embedding' | 'saving' | 'complete' | 'error';
  progress: number; // 0 to 1
  message: string;
}

/**
 * Extract clean text and page count from an uploaded PDF file in-browser
 */
export async function extractTextFromPDF(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<{ fullText: string; pageTexts: { page: number; text: string }[]; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;
  const pageTexts: { page: number; text: string }[] = [];
  let fullText = '';

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .filter((s: string) => s.trim().length > 0);
    const pageText = strings.join(' ');
    pageTexts.push({ page: i, text: pageText });
    fullText += `\n--- [Page ${i}] ---\n` + pageText;

    if (onProgress) {
      onProgress(i, pageCount);
    }
  }

  return { fullText, pageTexts, pageCount };
}

/**
 * Complete document ingestion pipeline
 */
export async function processAndIngestDocument(
  fileOrText: { name: string; type: DocumentType; content?: string; file?: File },
  onProgress?: (progress: IngestionProgress) => void
): Promise<DocumentItem> {
  const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  let extractedText = '';
  let pageCount: number | undefined;
  let fileSizeBytes = 0;

  // 1. Reading & Parsing Stage
  onProgress?.({ stage: 'reading', progress: 0.1, message: `Reading ${fileOrText.name}...` });

  if (fileOrText.type === 'pdf' && fileOrText.file) {
    fileSizeBytes = fileOrText.file.size;
    const pdfData = await extractTextFromPDF(fileOrText.file, (cur, total) => {
      onProgress?.({
        stage: 'reading',
        progress: 0.1 + (cur / total) * 0.2,
        message: `Extracted page ${cur} of ${total}...`,
      });
    });
    extractedText = pdfData.fullText;
    pageCount = pdfData.pageCount;
  } else if (fileOrText.file) {
    fileSizeBytes = fileOrText.file.size;
    extractedText = await fileOrText.file.text();
  } else if (fileOrText.content) {
    extractedText = fileOrText.content;
    fileSizeBytes = new Blob([extractedText]).size;
  }

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('No readable text found in document.');
  }

  // 2. Text Chunking Stage
  onProgress?.({ stage: 'chunking', progress: 0.35, message: 'Splitting text into semantic chunks...' });
  const chunks: ChunkItem[] = splitTextIntoChunks(extractedText, docId, fileOrText.name);

  if (chunks.length === 0) {
    throw new Error('Failed to create text chunks from document.');
  }

  // 3. Embedding Generation Stage
  onProgress?.({
    stage: 'embedding',
    progress: 0.45,
    message: `Computing embeddings for ${chunks.length} chunks...`,
  });

  const textsToEmbed = chunks.map((c) => c.text);
  const embeddings = await generateBatchEmbeddings(textsToEmbed, (cur, total) => {
    onProgress?.({
      stage: 'embedding',
      progress: 0.45 + (cur / total) * 0.45,
      message: `Generating embeddings (${cur}/${total})...`,
    });
  });

  // Assign embeddings to chunks
  chunks.forEach((chunk, i) => {
    chunk.embedding = embeddings[i];
  });

  // 4. Persistence Stage
  onProgress?.({ stage: 'saving', progress: 0.95, message: 'Saving to local IndexedDB...' });

  const docItem: DocumentItem = {
    id: docId,
    title: fileOrText.name,
    type: fileOrText.type,
    size: fileSizeBytes,
    charCount: extractedText.length,
    chunkCount: chunks.length,
    createdAt: Date.now(),
    content: extractedText,
    pageCount,
  };

  await db.documents.put(docItem);
  await db.chunks.bulkPut(chunks);

  // Register with active hybrid retriever
  globalRetriever.addChunks(chunks);

  onProgress?.({ stage: 'complete', progress: 1.0, message: 'Document ready for AI questions & learning!' });

  return docItem;
}
