import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  BookOpen,
  Sparkles,
  Search,
  CheckCircle2,
  Layers,
  FileCode,
  FileSpreadsheet,
  X,
  FileQuestion,
  HelpCircle,
} from 'lucide-react';
import { DocumentItem } from '../lib/types';
import { IngestionProgress } from '../lib/ingestion/documentProcessor';

interface SidebarProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  onSelectDoc: (docId: string | null) => void;
  onUploadFile: (file: File) => void;
  onAddNote: (title: string, content: string) => void;
  onLoadSample: (sampleIndex: number) => void;
  onDeleteDoc: (docId: string) => void;
  ingestionProgress: IngestionProgress | null;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  selectedDocId,
  onSelectDoc,
  onUploadFile,
  onAddNote,
  onLoadSample,
  onDeleteDoc,
  ingestionProgress,
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  const submitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    onAddNote(noteTitle.trim(), noteContent.trim());
    setNoteTitle('');
    setNoteContent('');
    setShowNoteModal(false);
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileSpreadsheet className="h-4 w-4 text-red-500" />;
      case 'markdown':
        return <FileCode className="h-4 w-4 text-indigo-500" />;
      default:
        return <FileText className="h-4 w-4 text-emerald-500" />;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static top-16 bottom-0 left-0 z-40 w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Knowledge Base Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Knowledge Base
              </h2>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
              {documents.length} {documents.length === 1 ? 'doc' : 'docs'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Doc</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.txt,.markdown"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Paste Note</span>
            </button>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 scale-[0.99]'
                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'
            }`}
          >
            <Upload className="h-5 w-5 mx-auto text-slate-400 mb-1" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Drop PDF, MD, or TXT here
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Parsed 100% locally in browser
            </p>
          </div>

          {/* Load Sample Docs */}
          <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">Want to test quickly?</span>
            <button
              onClick={() => onLoadSample(0)}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" />
              <span>Load RAG Guide</span>
            </button>
          </div>
        </div>

        {/* Search & Scope Filter */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Active Scope Toggle */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-400 text-[11px]">RAG Query Scope:</span>
            <button
              onClick={() => onSelectDoc(null)}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                selectedDocId === null
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All Documents
            </button>
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
              <FileQuestion className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No documents found.</p>
              <p className="text-[11px] mt-1 text-slate-400">
                Upload a PDF or click "Load RAG Guide" above.
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isSelected = selectedDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDoc(isSelected ? null : doc.id)}
                  className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getDocIcon(doc.type)}
                      <h3
                        className={`text-xs font-semibold truncate ${
                          isSelected
                            ? 'text-indigo-900 dark:text-indigo-200'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                        title={doc.title}
                      >
                        {doc.title}
                      </h3>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Remove "${doc.title}"?`)) {
                          onDeleteDoc(doc.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity rounded"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Layers className="h-3 w-3" />
                      {doc.chunkCount} chunks
                    </span>
                    <span>{formatSize(doc.size)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Local Storage: IndexedDB</span>
          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Encrypted by OS
          </span>
        </div>
      </aside>

      {/* Ingestion Progress Modal */}
      {ingestionProgress && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Sparkles className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Ingesting Document
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ingestionProgress.message}
                </p>
              </div>
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.round(ingestionProgress.progress * 100)}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 text-right">
              {Math.round(ingestionProgress.progress * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Manual Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add Custom Note / Documentation
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. System Architecture Notes.md"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Content (Markdown or Plain Text)
                </label>
                <textarea
                  rows={8}
                  placeholder="Paste documentation, lecture notes, or code snippets here..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 font-mono text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all"
                >
                  Save & Ingest Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
