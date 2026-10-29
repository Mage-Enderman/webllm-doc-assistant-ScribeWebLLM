import React from 'react';
import { DownloadCloud, Sparkles, AlertTriangle, CheckCircle2, Info, SlidersHorizontal } from 'lucide-react';
import { ModelOption, ModelStatus } from '../lib/types';

interface ModelStatusBannerProps {
  modelStatus: ModelStatus;
  selectedModel: ModelOption;
  onOpenModelSettings?: () => void;
}

const PROVIDER_LABEL: Record<ModelOption['provider'], string> = {
  webllm: 'WebGPU (WebLLM)',
  gguf: 'GGUF (llama.cpp in-browser)',
  openai: 'OpenAI-compatible API',
};

export const ModelStatusBanner: React.FC<ModelStatusBannerProps> = ({
  modelStatus,
  selectedModel,
  onOpenModelSettings,
}) => {
  if (modelStatus.state === 'idle') {
    const isRemote = selectedModel.provider === 'openai';

    return (
      <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 gap-2">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Active engine:</strong> {PROVIDER_LABEL[selectedModel.provider]} ·{' '}
              <strong>{selectedModel.name}</strong>. Click "Initialize" in the header to{' '}
              {isRemote ? 'verify the endpoint' : 'load the model'}.
            </span>
          </div>
          <span className="hidden sm:inline-block text-indigo-500 dark:text-indigo-400/80 text-[11px] shrink-0">
            {isRemote ? 'Requests go to your endpoint only' : 'No data ever leaves your device'}
          </span>
        </div>
      </div>
    );
  }

  if (modelStatus.state === 'downloading' || modelStatus.state === 'compiling') {
    const percent = Math.min(100, Math.max(0, Math.round(modelStatus.progress * 100)));
    const isRemote = selectedModel.provider === 'openai';

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
              <span>{modelStatus.text || 'Preparing engine...'}</span>
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
            <span>
              {isRemote
                ? 'Checking connectivity and credentials for your endpoint.'
                : 'Model weights are cached locally in your browser so future visits load immediately.'}
            </span>
            <span className="hidden md:inline font-mono text-indigo-500 dark:text-indigo-400">
              {isRemote ? 'OpenAI-compatible' : 'Local inference'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (modelStatus.state === 'error' && modelStatus.errorKind === 'runtime') {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Not available in this build</div>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300 text-[11px] break-words">
              {modelStatus.error}
            </p>
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300/90">
              Nothing is broken on your side: this model's architecture is newer than the bundled
              llama.cpp runtime. Run it through an OpenAI-compatible server (llama.cpp, LM Studio or
              Ollama) — Model settings can detect one running on this machine — or pick a WebGPU
              model to stay fully in-browser.
            </p>
          </div>
          {onOpenModelSettings && (
            <button
              type="button"
              onClick={onOpenModelSettings}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-100 text-[11px] font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Model settings</span>
            </button>
          )}
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
            {modelStatus.error && (
              <p className="mt-0.5 text-red-700 dark:text-red-400 text-[11px] break-words">
                {modelStatus.error}
              </p>
            )}
            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400/90">
              {selectedModel.provider === 'webllm'
                ? 'Ensure you are on Google Chrome 113+ or Microsoft Edge 113+ with hardware acceleration enabled.'
                : selectedModel.provider === 'gguf'
                ? 'Open Model settings to choose another GGUF file or URL, or switch to a WebGPU model.'
                : 'Check the base URL, model name and API key in Model settings (the server must allow CORS).'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50 px-4 py-1.5">
      <div className="max-w-7xl mx-auto flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>
          {modelStatus.text} · {PROVIDER_LABEL[selectedModel.provider]}
        </span>
      </div>
    </div>
  );
};
