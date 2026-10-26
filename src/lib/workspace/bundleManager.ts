import { db } from '../db';
import { globalRetriever } from '../rag/retriever';
import {
  DocumentItem,
  ChunkItem,
  Flashcard,
  SmartNote,
  SummaryResult,
  Quiz,
} from '../types';

export interface ScribeBundleMetadata {
  version: number;
  appName: string;
  bundleName: string;
  createdAt: number;
  docCount: number;
  chunkCount: number;
  flashcardCount: number;
  notesCount: number;
}

export interface ScribeBundle {
  meta: ScribeBundleMetadata;
  documents: DocumentItem[];
  chunks: ChunkItem[];
  flashcards: Flashcard[];
  notes: SmartNote[];
  summaries: SummaryResult[];
  quizzes: Quiz[];
}

/**
 * Exports all or selected documents with their chunks (including vectors) and study data
 * into a downloadable .scribe bundle.
 */
export async function exportWorkspaceBundle(options: {
  docIds?: string[];
  name?: string;
}): Promise<void> {
  const { docIds, name = 'Scribe-Workspace' } = options;

  let documents: DocumentItem[] = [];
  let chunks: ChunkItem[] = [];
  let flashcards: Flashcard[] = [];
  let notes: SmartNote[] = [];
  let summaries: SummaryResult[] = [];
  let quizzes: Quiz[] = [];

  if (docIds && docIds.length > 0) {
    documents = await db.documents.where('id').anyOf(docIds).toArray();
    chunks = await db.chunks.where('docId').anyOf(docIds).toArray();
    flashcards = await db.flashcards.where('docId').anyOf(docIds).toArray();
    notes = await db.notes.where('docId').anyOf(docIds).toArray();
    summaries = await db.summaries.where('docId').anyOf(docIds).toArray();
    quizzes = await db.quizzes.where('docId').anyOf(docIds).toArray();
  } else {
    documents = await db.documents.toArray();
    chunks = await db.chunks.toArray();
    flashcards = await db.flashcards.toArray();
    notes = await db.notes.toArray();
    summaries = await db.summaries.toArray();
    quizzes = await db.quizzes.toArray();
  }

  const bundle: ScribeBundle = {
    meta: {
      version: 1,
      appName: 'ScribeWebLLM',
      bundleName: name,
      createdAt: Date.now(),
      docCount: documents.length,
      chunkCount: chunks.length,
      flashcardCount: flashcards.length,
      notesCount: notes.length,
    },
    documents,
    chunks,
    flashcards,
    notes,
    summaries,
    quizzes,
  };

  const jsonString = JSON.stringify(bundle);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  link.download = `${safeName}-${Date.now()}.scribe`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validates and imports a .scribe bundle file into IndexedDB and re-hydrates the hybrid retriever.
 */
export async function importWorkspaceBundle(
  file: File,
  mode: 'merge' | 'replace' = 'merge'
): Promise<{
  docCount: number;
  chunkCount: number;
  flashcardCount: number;
}> {
  const text = await file.text();
  let bundle: ScribeBundle;

  try {
    bundle = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid bundle file: unable to parse JSON format.');
  }

  if (!bundle.meta || !bundle.documents || !Array.isArray(bundle.documents)) {
    throw new Error('Invalid .scribe file structure: missing required bundle metadata or documents.');
  }

  await db.transaction(
    'rw',
    [
      db.documents,
      db.chunks,
      db.flashcards,
      db.notes,
      db.summaries,
      db.quizzes,
    ],
    async () => {
      if (mode === 'replace') {
        await db.documents.clear();
        await db.chunks.clear();
        await db.flashcards.clear();
        await db.notes.clear();
        await db.summaries.clear();
        await db.quizzes.clear();
      }

      // Bulk put documents
      if (bundle.documents.length > 0) {
        await db.documents.bulkPut(bundle.documents);
      }

      // Bulk put chunks (including precomputed embeddings)
      if (bundle.chunks && bundle.chunks.length > 0) {
        await db.chunks.bulkPut(bundle.chunks);
      }

      // Bulk put flashcards
      if (bundle.flashcards && bundle.flashcards.length > 0) {
        await db.flashcards.bulkPut(bundle.flashcards);
      }

      // Bulk put notes
      if (bundle.notes && bundle.notes.length > 0) {
        await db.notes.bulkPut(bundle.notes);
      }

      // Bulk put summaries
      if (bundle.summaries && bundle.summaries.length > 0) {
        await db.summaries.bulkPut(bundle.summaries);
      }

      // Bulk put quizzes
      if (bundle.quizzes && bundle.quizzes.length > 0) {
        await db.quizzes.bulkPut(bundle.quizzes);
      }
    }
  );

  // Update in-memory HybridRetriever
  if (mode === 'replace') {
    globalRetriever.setChunks(bundle.chunks || []);
  } else {
    globalRetriever.addChunks(bundle.chunks || []);
  }

  return {
    docCount: bundle.documents.length,
    chunkCount: bundle.chunks?.length || 0,
    flashcardCount: bundle.flashcards?.length || 0,
  };
}
