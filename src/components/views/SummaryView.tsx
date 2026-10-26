import React, { useState, useEffect } from 'react';
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
  FolderOpen,
} from 'lucide-react';
import { DocumentItem, ModelStatus } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import {
  buildChunkBatchSummaryPrompt,
  buildFinalSummaryPrompt,
  buildMultiDocSummaryPrompt,
} from '../../lib/rag/harness';

interface SummaryViewProps {
  documents: DocumentItem[];
  selectedDocId?: string | null;
  selectedDocIds?: string[];
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  documents,
  selectedDocId,
  selectedDocIds = [],
  modelStatus,
  onInitializeModel,
}) => {
  // Target scope: can be 'group' (selectedDocIds), 'all', or a single doc ID
  const [targetScope, setTargetScope] = useState<string>(() => {
    if (selectedDocIds.length > 1) return 'group';
    if (selectedDocId) return selectedDocId;
    return documents[0]?.id ?? '';
  });

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [mapProgress, setMapProgress] = useState<{ current: number; total: number } | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedDocIds.length > 1) {
      setTargetScope('group');
    } else if (selectedDocId) {
      setTargetScope(selectedDocId);
    }
  }, [selectedDocIds, selectedDocId]);

  // Determine target documents based on targetScope
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

  const handleGenerateSummary = async () => {
    const targetDocs = getTargetDocs();
    if (targetDocs.length === 0) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsSummarizing(true);
    setSummaryResult(null);

    try {
      if (targetDocs.length === 1) {
        // Single Document Map-Reduce
        const doc = targetDocs[0];
        setCurrentStep(`Retrieving chunks for "${doc.title}"...`);

        const chunks = await db.chunks.where('docId').equals(doc.id).sortBy('chunkIndex');
        if (chunks.length === 0) {
          throw new Error(`No chunks found for "${doc.title}".`);
        }

        let finalSummary = '';

        if (chunks.length <= 3) {
          setCurrentStep('Synthesizing direct executive summary...');
          const texts = chunks.map((c) => c.text);
          const { system, user } = buildFinalSummaryPrompt(texts, doc.title);

          finalSummary = await llmEngine.completeChat(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.2, max_tokens: 850 }
          );
        } else {
          const batchSize = 3;
          const batches: string[][] = [];
          for (let i = 0; i < chunks.length; i += batchSize) {
            batches.push(chunks.slice(i, i + batchSize).map((c) => c.text));
          }

          const intermediatePoints: string[] = [];
          setMapProgress({ current: 0, total: batches.length });

          for (let b = 0; b < batches.length; b++) {
            setCurrentStep(`Map Stage: Extracting insights from Batch ${b + 1} of ${batches.length}...`);
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

          setCurrentStep('Reduce Stage: Synthesizing final structured executive report...');
          setMapProgress(null);

          const { system, user } = buildFinalSummaryPrompt(intermediatePoints, doc.title);
          finalSummary = await llmEngine.completeChat(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.2, max_tokens: 900 }
          );
        }

        setSummaryResult(finalSummary);
      } else {
        // Multi-Document Group Synthesis
        const docSummaries: { title: string; summary: string }[] = [];

        for (let i = 0; i < targetDocs.length; i++) {
          const doc = targetDocs[i];
          setCurrentStep(`Digest ${i + 1}/${targetDocs.length}: Extracting core points from "${doc.title}"...`);
          setMapProgress({ current: i + 1, total: targetDocs.length });

          const chunks = await db.chunks.where('docId').equals(doc.id).sortBy('chunkIndex');
          if (chunks.length === 0) continue;

          // Quick distillation for multi-doc
          const sampleTexts = chunks.slice(0, 4).map((c) => c.text);
          const { system, user } = buildChunkBatchSummaryPrompt(sampleTexts);

          const summary = await llmEngine.completeChat(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.2, max_tokens: 400 }
          );

          docSummaries.push({ title: doc.title, summary });
        }

        setCurrentStep('Cross-Document Stage: Synthesizing unified multi-document report...');
        setMapProgress(null);

        const { system, user } = buildMultiDocSummaryPrompt(docSummaries);
        const unifiedSummary = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.2, max_tokens: 950 }
        );

        setSummaryResult(unifiedSummary);
      }
    } catch (err: any) {
      console.error('Summary generation error:', err);
      alert(`Summary generation notice: ${err.message || 'Error occurred during small model summarization.'}`);
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
    if (!summaryResult) return;
    const blob = new Blob([summaryResult], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Summary-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const targetDocs = getTargetDocs();

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
              Digest individual documents or group multiple documents together into an executive comparative synthesis.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Select Scope for Summary"
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
              disabled={isSummarizing}
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
                  📄 {d.title} ({d.chunkCount} chunks)
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
                  <span>
                    {targetDocs.length > 1
                      ? `Summarize Group (${targetDocs.length} Docs)`
                      : 'Generate Summary'}
                  </span>
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
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{currentStep}</span>
              </span>
              {mapProgress && (
                <span>
                  {mapProgress.current} / {mapProgress.total}
                </span>
              )}
            </div>

            {mapProgress && (
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${(mapProgress.current / mapProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Output */}
      {summaryResult ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {targetDocs.length > 1
                  ? `Multi-Document Synthesis (${targetDocs.length} Documents)`
                  : `Structured Summary: ${targetDocs[0]?.title}`}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={downloadSummaryMarkdown}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save Markdown</span>
              </button>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {summaryResult}
          </div>
        </div>
      ) : (
        !isSummarizing && (
          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              Select a single document or group above, then click "Generate Summary".
            </p>
          </div>
        )
      )}
    </div>
  );
};
