import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  FileText,
  Brain,
  RefreshCw,
} from 'lucide-react';
import { exportWorkspaceBundle, importWorkspaceBundle } from '../../lib/workspace/bundleManager';
import { DocumentItem } from '../../lib/types';

interface BundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  selectedDocIds: string[];
  onImportSuccess: () => Promise<void>;
}

export const BundleModal: React.FC<BundleModalProps> = ({
  isOpen,
  onClose,
  documents,
  selectedDocIds,
  onImportSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [bundleName, setBundleName] = useState('My-Study-Pack');
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const docIds = exportScope === 'selected' && selectedDocIds.length > 0 ? selectedDocIds : undefined;
      await exportWorkspaceBundle({ docIds, name: bundleName });
      setStatusMessage({ text: 'Pack exported successfully!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Export failed.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileImport = async (file: File) => {
    if (!file.name.endsWith('.scribe') && !file.name.endsWith('.json')) {
      setStatusMessage({ text: 'Please select a valid .scribe or .json bundle file.', type: 'error' });
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const result = await importWorkspaceBundle(file, importMode);
      await onImportSuccess();
      setStatusMessage({
        text: `Successfully imported ${result.docCount} docs, ${result.chunkCount} chunks, and ${result.flashcardCount} cards!`,
        type: 'success',
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Import failed.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Workspace Packs (.scribe)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Backup, transfer, or share your entire knowledge base and precomputed vectors
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl my-4">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'export'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Pack</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'import'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Pack</span>
          </button>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Tab 1: Export */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bundle Name
              </label>
              <input
                type="text"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g. OS-Architecture-Pack"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Export Scope
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    exportScope === 'all'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold">Entire Workspace</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    All {documents.length} documents & vectors
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('selected')}
                  disabled={selectedDocIds.length === 0}
                  className={`p-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                    exportScope === 'selected'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold">Active Group Only</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedDocIds.length > 0
                      ? `${selectedDocIds.length} checked documents`
                      : 'No docs checked'}
                  </p>
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Includes in the bundle:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Pre-computed EmbeddingGemma 2 vectors (instant zero-delay import)</li>
                <li>Full document text, parsed chunk boundary mappings</li>
                <li>All SM-2 spaced repetition review intervals & flashcard cards</li>
                <li>Extracted smart notes, summaries, and quizzes</li>
              </ul>
            </div>

            <button
              onClick={handleExport}
              disabled={isProcessing || documents.length === 0}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>Download .scribe Pack</span>
            </button>
          </div>
        )}

        {/* Tab 2: Import */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Import Behavior
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    importMode === 'merge'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold">Merge with Existing</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Keeps current docs and adds imported ones
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    importMode === 'replace'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    Replace Workspace
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Clears workspace and loads the pack
                  </p>
                </button>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/40"
            >
              <Upload className="h-8 w-8 mx-auto text-indigo-500 mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Click or drop a .scribe pack here
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Instantly unpacks documents, vectors, and study data
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".scribe,.json"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileImport(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );
};
