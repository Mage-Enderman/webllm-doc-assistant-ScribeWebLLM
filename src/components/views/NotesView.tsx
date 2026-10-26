import React, { useState } from 'react';
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
  selectedDocId: string | null;
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  documents,
  selectedDocId,
  modelStatus,
  onInitializeModel,
}) => {
  const [activeDocId, setActiveDocId] = useState<string>(
    selectedDocId || (documents[0]?.id ?? '')
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [notesContent, setNotesContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];

  const handleGenerateNotes = async () => {
    if (!activeDoc) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsGenerating(true);
    setNotesContent(null);

    try {
      // Retrieve first 4 chunks or top representative chunks
      const chunks = await db.chunks
        .where('docId')
        .equals(activeDoc.id)
        .limit(4)
        .toArray();

      const combinedText = chunks.map((c) => c.text).join('\n\n');
      const { system, user } = buildSmartNotesPrompt(combinedText, activeDoc.title);

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

  const downloadNotes = () => {
    if (!notesContent || !activeDoc) return;
    const blob = new Blob([notesContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc.title}_SmartNotes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (documents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          No Documents in Knowledge Base
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Upload notes or documentation to convert them into structured study sheets and concept guides.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 space-y-6">
      {/* Configuration Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Smart Study Notes Generator
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Transforms raw documentation into high-yield study cards, key concept definitions, and review questions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Select Document for Notes"
              value={activeDoc?.id || ''}
              onChange={(e) => setActiveDocId(e.target.value)}
              disabled={isGenerating}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-medium max-w-[220px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
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
                  <span>Generating Notes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Study Notes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Notes Output */}
      {notesContent ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Study Guide: {activeDoc?.title}
              </h3>
              <p className="text-xs text-slate-400">Extracted locally with WebLLM</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={downloadNotes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export .md</span>
              </button>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">
            {notesContent}
          </div>
        </div>
      ) : (
        !isGenerating && (
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-indigo-400 mb-2 opacity-60" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Convert notes into an organized study sheet
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Click "Generate Study Notes" to extract definitions, concepts, and review questions tailored for revision.
            </p>
          </div>
        )
      )}
    </div>
  );
};
