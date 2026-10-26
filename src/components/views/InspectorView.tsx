import React, { useState, useEffect } from 'react';
import { Layers, Search, Sparkles, FileText, Hash, CheckCircle2 } from 'lucide-react';
import { ChunkItem, DocumentItem, SearchResult } from '../../lib/types';
import { db } from '../../lib/db';
import { globalRetriever } from '../../lib/rag/retriever';

interface InspectorViewProps {
  documents: DocumentItem[];
}

export const InspectorView: React.FC<InspectorViewProps> = ({ documents }) => {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [testQuery, setTestQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadChunks();
  }, [documents]);

  const loadChunks = async () => {
    const allChunks = await db.chunks.toArray();
    setChunks(allChunks);
  };

  const handleTestSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await globalRetriever.search(testQuery.trim(), { topK: 6 });
      setSearchResults(results);
    } catch (err) {
      console.error('Test search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 space-y-6">
      {/* Overview Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            RAG Chunk & Embedding Inspector
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Inspect how your documents are chunked, tokenized, and embedded. Test hybrid retrieval (Dense + BM25 via RRF) in real-time.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block text-[11px]">Total Documents</span>
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              {documents.length}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block text-[11px]">Indexed Chunks</span>
            <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono">
              {chunks.length}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block text-[11px]">Vector Dimensions</span>
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              384 (all-MiniLM)
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block text-[11px]">Lexical Engine</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              MiniSearch BM25
            </span>
          </div>
        </div>
      </div>

      {/* Hybrid Search Simulator */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Search className="h-4 w-4 text-indigo-500" />
          <span>Hybrid Retrieval Simulator</span>
        </h3>

        <form onSubmit={handleTestSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Type a test query to simulate hybrid search ranking..."
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isSearching || !testQuery.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Simulate</span>
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Top Ranked Chunks (RRF Fusion)
            </h4>
            <div className="space-y-2">
              {searchResults.map((res, i) => (
                <div
                  key={res.chunk.id}
                  className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                      <span className="h-5 w-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                        #{i + 1}
                      </span>
                      {res.chunk.docTitle} (Chunk {res.chunk.chunkIndex + 1})
                    </span>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-indigo-600 dark:text-indigo-400">
                        RRF: {res.score.toFixed(4)}
                      </span>
                      <span className="text-slate-400">
                        Dense Sim: {res.denseScore?.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px] bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">
                    {res.chunk.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Raw Chunks Explorer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Hash className="h-4 w-4 text-indigo-500" />
          <span>All Stored Chunks ({chunks.length})</span>
        </h3>

        <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
          {chunks.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              No chunks indexed yet. Upload a document to view chunks.
            </p>
          ) : (
            chunks.map((chunk) => (
              <div
                key={chunk.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                    {chunk.docTitle}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">
                      ~{chunk.tokenEstimate} tokens
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> Vector 384D
                    </span>
                  </div>
                </div>
                <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {chunk.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
