import React from 'react';
import { DownloadCloud, Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { ModelStatus } from '../lib/types';

interface ModelStatusBannerProps {
  modelStatus: ModelStatus;
  selectedModelName: string;
}

export const ModelStatusBanner: React.FC<ModelStatusBannerProps> = ({
  modelStatus,
  selectedModelName,
}) => {
  if (modelStatus.state === 'idle') {
    return (
      <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 gap-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              <strong>Local AI Engine:</strong> Selected model is <strong>{selectedModelName}</strong>. Click "Initialize" in the header to load weights into WebGPU memory.
            </span>
          </div>
          <span className="hidden sm:inline-block text-indigo-500 dark:text-indigo-400/80 text-[11px]">
            No data ever leaves your device
          </span>
        </div>
      </div>
    );
  }

  if (modelStatus.state === 'downloading' || modelStatus.state === 'compiling') {
    const percent = Math.min(100, Math.max(0, Math.round(modelStatus.progress * 100)));

    return (
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/60 dark:via-purple-950/60 dark:to-pink-950/60 border-b border-indigo-200 dark:border-indigo-800/60 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-1.5 text-xs font-semibold">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
              {modelStatus.state === 'downloading' ? (
                <DownloadCloud className="h-4 w-4 animate-bounce text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Sparkles className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
              )}
              <span>{modelStatus.text || 'Preparing WebGPU engine...'}</span>
            </div>
            <span className="text-indigo-600 dark:text-indigo-400 font-mono">{percent}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Model weights are cached locally in your browser so future visits load immediately.</span>
            <span className="hidden md:inline font-mono text-indigo-500 dark:text-indigo-400">WebGPU accelerated</span>
          </p>
        </div>
      </div>
    );
  }

  if (modelStatus.state === 'error') {
    return (
      <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">{modelStatus.text}</div>
            {modelStatus.error && <p className="mt-0.5 text-red-700 dark:text-red-400 text-[11px]">{modelStatus.error}</p>}
            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400/90">
              Ensure you are on Google Chrome 113+ or Microsoft Edge 113+ with hardware acceleration enabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
