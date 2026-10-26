export type DocumentType = 'pdf' | 'markdown' | 'text' | 'note';

export interface DocumentItem {
  id: string;
  title: string;
  type: DocumentType;
  size: number;
  charCount: number;
  chunkCount: number;
  createdAt: number;
  content: string;
  pageCount?: number;
}

export interface ChunkMetadata {
  page?: number;
  heading?: string;
  startChar: number;
  endChar: number;
}

export interface ChunkItem {
  id: string;
  docId: string;
  docTitle: string;
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
  embedding?: number[];
  metadata: ChunkMetadata;
}

export interface SearchResult {
  chunk: ChunkItem;
  score: number;
  denseScore?: number;
  bm25Score?: number;
}

export interface CitationItem {
  docId: string;
  chunkId: string;
  docTitle: string;
  page?: number;
  textSnippet: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  citations?: CitationItem[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  docId: string;
  docTitle: string;
  title: string;
  questions: QuizQuestion[];
  userAnswers?: Record<number, number>;
  score?: number;
  completed: boolean;
  createdAt: number;
}

export interface KeyConcept {
  term: string;
  definition: string;
}

export interface SmartNote {
  id: string;
  docId: string;
  docTitle: string;
  title: string;
  summary: string;
  keyConcepts: KeyConcept[];
  takeaways: string[];
  studyQuestions: string[];
  createdAt: number;
}

export interface SectionSummary {
  title: string;
  summary: string;
}

export interface SummaryResult {
  id: string;
  docId: string;
  docTitle: string;
  tldr: string;
  executiveSummary: string;
  sectionBreakdowns: SectionSummary[];
  createdAt: number;
}

export interface ModelOption {
  id: string;
  name: string;
  vramMB: number;
  sizeLabel: string;
  description: string;
  recommendedFor: string;
  default?: boolean;
}

export interface ModelStatus {
  state: 'idle' | 'downloading' | 'compiling' | 'ready' | 'error';
  progress: number; // 0 to 1
  text: string;
  error?: string;
  loadedModelId?: string;
}
