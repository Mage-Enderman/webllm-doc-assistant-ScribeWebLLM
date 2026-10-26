import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  Tag,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { DocumentItem, ModelStatus } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import { buildSmartNotesPrompt } from '../../lib/rag/harness';

interface NotesViewProps {
  documents: DocumentItem[];
  selectedDocId?: string | null;
  selectedDocIds?: string[];
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  documents,
  selectedDocId,
  selectedDocIds = [],
  modelStatus,
  onInitializeModel,
}) => {
  const [targetScope, setTargetScope] = useState<string>(() => {
    if (selectedDocIds.length > 1) return 'group';
    if (selectedDocId) return selectedDocId;
    return documents[0]?.id ?? '';
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [notesContent, setNotesContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedDocIds.length > 1) {
      setTargetScope('group');
    } else if (selectedDocId) {
      setTargetScope(selectedDocId);
    }
  }, [selectedDocIds, selectedDocId]);

  const getTargetDocs = (): DocumentItem[] => {
    if (targetScope === 'group') {
      const docs = documents.filter((d) => selectedDocIds.includes(d.id));
      return docs.length > 0 ? docs : documents;
    }
    if (targetScope === 'all') {
      return documents;
    }
    const single = documents.find((d) => d.id === targetScope);
    return single ? [single] : documents.slice(0, 1);
  };

  const handleGenerateNotes = async () => {
    const targetDocs = getTargetDocs();
    if (targetDocs.length === 0) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsGenerating(true);
    setNotesContent(null);

    try {
      let combinedText = '';
      let scopeLabel = '';

      if (targetDocs.length === 1) {
        const doc = targetDocs[0];
        scopeLabel = doc.title;
        const chunks = await db.chunks
          .where('docId')
          .equals(doc.id)
          .limit(5)
          .toArray();

        combinedText = chunks.map((c) => c.text).join('\n\n');
      } else {
        scopeLabel = `Document Group (${targetDocs.map((d) => d.title).join(', ')})`;
        // Sample chunks evenly across the documents
        const perDocLimit = Math.max(1, Math.floor(6 / targetDocs.length));
        const allSampleChunks: string[] = [];

        for (const doc of targetDocs) {
          const chunks = await db.chunks
            .where('docId')
            .equals(doc.id)
            .limit(perDocLimit)
            .toArray();

          for (const c of chunks) {
            allSampleChunks.push(`[From: ${doc.title}]\n${c.text}`);
          }
        }

        combinedText = allSampleChunks.join('\n\n');
      }

      const { system, user } = buildSmartNotesPrompt(combinedText, scopeLabel);

      const notes = await llmEngine.completeChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { temperature: 0.2, max_tokens: 850 }
      );

      setNotesContent(notes);
    } catch (err: any) {
      console.error('Notes generation error:', err);
      alert(`Notes generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!notesContent) return;
    navigator.clipboard.writeText(notesContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadNotesMarkdown = () => {
    if (!notesContent) return;
    const blob = new Blob([notesContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `StudyNotes-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (documents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          No Documents Loaded
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Upload a file or click "Load RAG Guide" in the sidebar to generate AI study notes.
        </p>
      </div>
    );
  }

  const targetDocs = getTargetDocs();

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 space-y-6">
      {/* Control Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Smart Study Notes & Concept Extractor
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distill key concepts, takeaways, and comprehension questions from one document or across an active group.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Select Scope for Notes"
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
              disabled={isGenerating}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-medium max-w-[240px] truncate"
            >
              {selectedDocIds.length > 1 && (
                <option value="group">
                  📁 Active Group ({selectedDocIds.length} docs)
                </option>
              )}
              {documents.length > 1 && (
                <option value="all">
                  📚 All Documents ({documents.length} docs)
                </option>
              )}
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  📄 {d.title}
                </option>
              ))}
            </select>

            <button
              onClick={handleGenerateNotes}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Extracting Notes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {targetDocs.length > 1
                      ? `Create Group Notes (${targetDocs.length} Docs)`
                      : 'Generate Study Notes'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {notesContent ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span>
                {targetDocs.length > 1
                  ? `Study Guide: Multi-Document Group (${targetDocs.length} Docs)`
                  : `Study Guide: ${targetDocs[0]?.title}`}
              </span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={downloadNotesMarkdown}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save Markdown</span>
              </button>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {notesContent}
          </div>
        </div>
      ) : (
        !isGenerating && (
          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              Select a scope above and click "Generate Study Notes".
            </p>
          </div>
        )
      )}
    </div>
  );
};
