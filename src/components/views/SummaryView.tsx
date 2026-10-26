import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Layers,
  Copy,
  Check,
  Download,
  AlertCircle,
  RefreshCw,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { DocumentItem, ModelStatus } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import {
  buildChunkBatchSummaryPrompt,
  buildFinalSummaryPrompt,
} from '../../lib/rag/harness';

interface SummaryViewProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  documents,
  selectedDocId,
  modelStatus,
  onInitializeModel,
}) => {
  const [activeDocId, setActiveDocId] = useState<string>(
    selectedDocId || (documents[0]?.id ?? '')
  );
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [mapProgress, setMapProgress] = useState<{ current: number; total: number } | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];

  const handleGenerateSummary = async () => {
    if (!activeDoc) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsSummarizing(true);
    setSummaryResult(null);
    setCurrentStep('Retrieving document chunks from IndexedDB...');

    try {
      // 1. Fetch all chunks for this document
      const chunks = await db.chunks.where('docId').equals(activeDoc.id).sortBy('chunkIndex');
      if (chunks.length === 0) {
        throw new Error('No chunks found for this document.');
      }

      // 2. Map-Reduce Execution
      // If doc is small (<= 3 chunks), direct summary
      let finalSummary = '';

      if (chunks.length <= 3) {
        setCurrentStep('Synthesizing direct executive summary...');
        const texts = chunks.map((c) => c.text);
        const { system, user } = buildFinalSummaryPrompt(texts, activeDoc.title);

        finalSummary = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.2, max_tokens: 850 }
        );
      } else {
        // Hierarchical Map-Reduce:
        // Batch chunks in groups of 3
        const batchSize = 3;
        const batches: string[][] = [];
        for (let i = 0; i < chunks.length; i += batchSize) {
          batches.push(chunks.slice(i, i + batchSize).map((c) => c.text));
        }

        const intermediatePoints: string[] = [];
        setMapProgress({ current: 0, total: batches.length });

        for (let b = 0; b < batches.length; b++) {
          setCurrentStep(`Map Stage: Extracting key insights from Batch ${b + 1} of ${batches.length}...`);
          setMapProgress({ current: b + 1, total: batches.length });

          const { system, user } = buildChunkBatchSummaryPrompt(batches[b]);
          const batchSummary = await llmEngine.completeChat(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.2, max_tokens: 450 }
          );
          intermediatePoints.push(batchSummary);
        }

        // Reduce Stage:
        setCurrentStep('Reduce Stage: Synthesizing final structured executive report...');
        setMapProgress(null);

        const { system, user } = buildFinalSummaryPrompt(intermediatePoints, activeDoc.title);
        finalSummary = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.2, max_tokens: 900 }
        );
      }

      setSummaryResult(finalSummary);
    } catch (err: any) {
      console.error('Summary generation error:', err);
      alert(`Summary generation failed: ${err.message}`);
    } finally {
      setIsSummarizing(false);
      setCurrentStep('');
      setMapProgress(null);
    }
  };

  const copyToClipboard = () => {
    if (!summaryResult) return;
    navigator.clipboard.writeText(summaryResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSummaryMarkdown = () => {
    if (!summaryResult || !activeDoc) return;
    const blob = new Blob([summaryResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc.title}_Summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (documents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <FileText className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          No Documents Available for Summary
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Upload a PDF or click "Load RAG Guide" from the left sidebar to generate structured summaries.
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
              <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Hierarchical AI Document Summarizer
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Uses a two-stage Map-Reduce pipeline designed to digest large documents with small browser models.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Select Document for Summary"
              value={activeDoc?.id || ''}
              onChange={(e) => setActiveDocId(e.target.value)}
              disabled={isSummarizing}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-medium max-w-[220px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.chunkCount} chunks)
                </option>
              ))}
            </select>

            <button
              onClick={handleGenerateSummary}
              disabled={isSummarizing}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              {isSummarizing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Summary</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Map-Reduce Progress Display */}
        {isSummarizing && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 animate-pulse" />
                {currentStep}
              </span>
              {mapProgress && (
                <span>
                  Batch {mapProgress.current} / {mapProgress.total}
                </span>
              )}
            </div>

            {mapProgress && (
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(mapProgress.current / mapProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Output */}
      {summaryResult ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Executive Synthesis: {activeDoc?.title}
              </h3>
              <p className="text-xs text-slate-400">
                Generated locally using {activeDoc?.chunkCount} chunks via WebLLM Map-Reduce
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Copy markdown"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={downloadSummaryMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Download .md"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export .md</span>
              </button>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">
            {summaryResult}
          </div>
        </div>
      ) : (
        !isSummarizing && (
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-indigo-400 mb-2 opacity-60" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Ready to synthesize document
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Select <strong>{activeDoc?.title}</strong> and click "Generate Summary". The small-model harness will summarize individual chunk batches and combine them into an executive overview.
            </p>
          </div>
        )
      )}
    </div>
  );
};
