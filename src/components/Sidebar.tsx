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
  CheckSquare,
  Square,
  FolderOpen,
  Archive,
} from 'lucide-react';
import { DocumentItem } from '../lib/types';
import { IngestionProgress } from '../lib/ingestion/documentProcessor';

interface SidebarProps {
  documents: DocumentItem[];
  selectedDocIds: string[];
  onToggleDocSelect: (docId: string) => void;
  onSelectSingleDoc: (docId: string | null) => void;
  onSelectAllDocs: () => void;
  onClearDocSelection: () => void;
  onUploadFile: (file: File) => void;
  onAddNote: (title: string, content: string) => void;
  onLoadSample: (sampleIndex: number) => void;
  onDeleteDoc: (docId: string) => void;
  onDeleteDocs: (docIds: string[]) => void;
  onClearAllDocs: () => void;
  onOpenBundleModal: () => void;
  ingestionProgress: IngestionProgress | null;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  selectedDocIds,
  onToggleDocSelect,
  onSelectSingleDoc,
  onSelectAllDocs,
  onClearDocSelection,
  onUploadFile,
  onAddNote,
  onLoadSample,
  onDeleteDoc,
  onDeleteDocs,
  onClearAllDocs,
  onOpenBundleModal,
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

  const isAllSelected =
    documents.length > 0 && selectedDocIds.length === documents.length;

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
        return <FileSpreadsheet className="h-4 w-4 text-rose-500" />;
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

            <button
              onClick={onOpenBundleModal}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
              title="Backup, export, or import entire knowledge bases with vectors"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Workspace Packs (.scribe)</span>
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

        {/* Search & Multi-Doc Group Scope Filter */}
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

          {/* Grouping / Scope Controls */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-indigo-500" />
                <span>Scope:</span>
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={onClearDocSelection}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                    selectedDocIds.length === 0
                      ? 'bg-indigo-600 text-white'
                      : 'text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Query all documents across the knowledge base"
                >
                  All Docs
                </button>

                {documents.length > 1 && (
                  <button
                    onClick={isAllSelected ? onClearDocSelection : onSelectAllDocs}
                    className="text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
            </div>

            {/* Active Group / Multi-Selection Toolbar */}
            {selectedDocIds.length > 0 && (
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-lg px-2 py-1 text-[11px]">
                <span className="text-indigo-700 dark:text-indigo-300 font-semibold truncate">
                  {selectedDocIds.length === 1
                    ? '1 doc selected'
                    : `Group: ${selectedDocIds.length} docs selected`}
                </span>

                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete ${selectedDocIds.length} selected document(s) and their chunks?`
                      )
                    ) {
                      onDeleteDocs(selectedDocIds);
                    }
                  }}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold"
                  title="Delete all selected documents"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Delete Selected</span>
                </button>
              </div>
            )}
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
              const isChecked = selectedDocIds.includes(doc.id);

              return (
                <div
                  key={doc.id}
                  onClick={() => onToggleDocSelect(doc.id)}
                  className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox for Multi-Doc Group Selection */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleDocSelect(doc.id);
                        }}
                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-0.5 rounded shrink-0"
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {getDocIcon(doc.type)}

                      <h3
                        className={`text-xs font-semibold truncate ${
                          isChecked
                            ? 'text-indigo-900 dark:text-indigo-200'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                        title={doc.title}
                      >
                        {doc.title}
                      </h3>
                    </div>

                    {/* Visible Delete Button with confirmation */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Remove "${doc.title}" and its chunks from local storage?`)) {
                          onDeleteDoc(doc.id);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors shrink-0"
                      title={`Delete "${doc.title}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pl-6">
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

        {/* Footer info & Clear All Documents */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] text-slate-400 flex items-center justify-between">
          {documents.length > 0 ? (
            <button
              onClick={() => {
                if (
                  confirm(
                    'Are you sure you want to delete ALL documents, chunks, and learning data from IndexedDB?'
                  )
                ) {
                  onClearAllDocs();
                }
              }}
              className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-medium"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear Knowledge Base</span>
            </button>
          ) : (
            <span>IndexedDB Storage</span>
          )}

          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 100% In-Browser
          </span>
        </div>
      </aside>

      {/* Paste Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Paste Study Note or Raw Text</span>
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Memory Management Lecture Notes"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Note Content
                </label>
                <textarea
                  placeholder="Paste or write notes, code explanations, or documentation here..."
                  rows={8}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
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
