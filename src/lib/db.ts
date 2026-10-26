import Dexie, { Table } from 'dexie';
import {
  DocumentItem,
  ChunkItem,
  ChatMessage,
  Quiz,
  SmartNote,
  SummaryResult,
  Flashcard,
} from './types';

export class DocuBrainDatabase extends Dexie {
  documents!: Table<DocumentItem, string>;
  chunks!: Table<ChunkItem, string>;
  messages!: Table<ChatMessage, string>;
  quizzes!: Table<Quiz, string>;
  notes!: Table<SmartNote, string>;
  summaries!: Table<SummaryResult, string>;
  flashcards!: Table<Flashcard, string>;

  constructor() {
    super('DocuBrainDB');
    this.version(1).stores({
      documents: 'id, title, type, createdAt',
      chunks: 'id, docId, chunkIndex',
      messages: 'id, role, timestamp',
      quizzes: 'id, docId, createdAt',
      notes: 'id, docId, createdAt',
      summaries: 'id, docId, createdAt',
    });

    this.version(2).stores({
      documents: 'id, title, type, createdAt',
      chunks: 'id, docId, chunkIndex',
      messages: 'id, role, timestamp',
      quizzes: 'id, docId, createdAt',
      notes: 'id, docId, createdAt',
      summaries: 'id, docId, createdAt',
      flashcards: 'id, docId, dueDate, createdAt',
    });
  }
}

export const db = new DocuBrainDatabase();

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.documents,
      db.chunks,
      db.messages,
      db.quizzes,
      db.notes,
      db.summaries,
      db.flashcards,
    ],
    async () => {
      await db.documents.clear();
      await db.chunks.clear();
      await db.messages.clear();
      await db.quizzes.clear();
      await db.notes.clear();
      await db.summaries.clear();
      await db.flashcards.clear();
    }
  );
}

export async function deleteDocumentWithChunks(docId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.documents,
      db.chunks,
      db.quizzes,
      db.notes,
      db.summaries,
      db.flashcards,
    ],
    async () => {
      await db.documents.delete(docId);
      await db.chunks.where('docId').equals(docId).delete();
      await db.quizzes.where('docId').equals(docId).delete();
      await db.notes.where('docId').equals(docId).delete();
      await db.summaries.where('docId').equals(docId).delete();
      await db.flashcards.where('docId').equals(docId).delete();
    }
  );
}
