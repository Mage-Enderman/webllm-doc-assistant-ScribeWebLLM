import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Layers,
  Sparkles,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { ChunkItem, DocumentItem } from '../../lib/types';
import { db } from '../../lib/db';

interface DocumentViewerProps {
  document: DocumentItem | null;
  highlightChunkId?: string | null;
  onClose: () => void;
  onDeleteDoc?: (docId: string) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  highlightChunkId,
  onClose,
  onDeleteDoc,
}) => {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (document) {
      loadDocumentChunks(document.id);
    }
  }, [document]);

  useEffect(() => {
    if (highlightChunkId && chunkRefs.current[highlightChunkId]) {
      chunkRefs.current[highlightChunkId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [highlightChunkId, chunks]);

  const loadDocumentChunks = async (docId: string) => {
    const docChunks = await db.chunks
      .where('docId')
      .equals(docId)
      .sortBy('chunkIndex');
    setChunks(docChunks);
  };

  if (!document) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-slate-400">
        <FileText className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-xs">No active document selected for viewer.</p>
      </div>
    );
  }

  const filteredChunks = chunks.filter((chunk) =>
    searchQuery.trim() === ''
      ? true
      : chunk.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 transition-all">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-850/70">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate" title={document.title}>
            {document.title}
          </h3>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
            Split View
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onDeleteDoc && (
            <button
              onClick={() => {
                if (confirm(`Remove "${document.title}" and all its data from the app?`)) {
                  onDeleteDoc(document.id);
                  onClose();
                }
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Delete Document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close Document View"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Document Search / Filter Bar */}
      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="relative">
          <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Find in document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 text-[11px] pl-7 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Chunks / Document Flow */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredChunks.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            No matching passages found.
          </p>
        ) : (
          filteredChunks.map((chunk) => {
            const isTarget = highlightChunkId === chunk.id;

            return (
              <div
                key={chunk.id}
                ref={(el) => {
                  chunkRefs.current[chunk.id] = el;
                }}
                className={`p-3 rounded-xl border text-xs transition-all duration-300 relative ${
                  isTarget
                    ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-500/30 shadow-md'
                    : 'border-slate-200 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-850/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Chunk header badge */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="font-mono flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                    <Layers className="h-3 w-3 text-indigo-500" />
                    Chunk {chunk.chunkIndex + 1}
                    {chunk.metadata.page && ` • Page ${chunk.metadata.page}`}
                  </span>
                  {isTarget && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full font-bold bg-indigo-600 text-white text-[9px] animate-pulse">
                      <Sparkles className="h-2.5 w-2.5" /> Cited Source
                    </span>
                  )}
                </div>

                {/* Chunk text */}
                <p className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${
                  isTarget
                    ? 'text-indigo-950 dark:text-indigo-100 font-medium'
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {chunk.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <span>{chunks.length} chunks indexed</span>
        <span>{document.charCount.toLocaleString()} chars</span>
      </div>
    </div>
  );
};
