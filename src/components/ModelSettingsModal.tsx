import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Globe,
  HardDrive,
  KeyRound,
  Link2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Radar,
} from 'lucide-react';
import { LLMSettings, setLocalGgufFile } from '../lib/llm/settings';
import { OpenAIProvider } from '../lib/llm/openai';
import { DiscoveredServer, discoverLocalServers } from '../lib/llm/discovery';
import { getGgufRuntimeLabel, sameEndpoint, setDiscoveredServers } from '../lib/llm/engine';

interface ModelSettingsModalProps {
  onClose: () => void;
  settings: LLMSettings;
  onSave: (next: LLMSettings) => void;
}

/**
 * Mounted only while open, so the draft always starts from the saved settings.
 */
export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  onClose,
  settings,
  onSave,
}) => {
  const [baseUrl, setBaseUrl] = useState(settings.openai.baseUrl);
  const [apiKey, setApiKey] = useState(settings.openai.apiKey);
  const [remoteModel, setRemoteModel] = useState(settings.openai.model);
  const [ggufName, setGgufName] = useState(settings.gguf.name);
  const [ggufUrl, setGgufUrl] = useState(settings.gguf.url);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DiscoveredServer[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoFilled = useRef(false);

  /** Pre-fills the fields only when exactly one model is found and none is set. */
  const applyDiscovery = (found: DiscoveredServer[]) => {
    setDiscoveredServers(found);
    setDetected(found);

    const serving = found.filter((server) => server.models.length > 0);
    if (
      !autoFilled.current &&
      !remoteModel.trim() &&
      serving.length === 1 &&
      serving[0].models.length === 1
    ) {
      autoFilled.current = true;
      setBaseUrl(serving[0].baseUrl);
      setRemoteModel(serving[0].models[0]);
    }
  };

  const runDetection = async () => {
    setDetecting(true);
    try {
      applyDiscovery(await discoverLocalServers());
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    void runDetection();
    // Scan once when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetchModels = async () => {
    setFetching(true);
    setFetchResult(null);
    try {
      const provider = new OpenAIProvider({
        baseUrl,
        apiKey,
        model: remoteModel,
      });
      const models = await provider.ping();
      setRemoteModels(models);
      setFetchResult({
        ok: true,
        message: models.length
          ? `Connected. ${models.length} model(s) available.`
          : 'Endpoint reachable, but it did not list any models.',
      });
      if (!remoteModel && models.length === 1) {
        setRemoteModel(models[0]);
      }
    } catch (err: any) {
      setFetchResult({ ok: false, message: err?.message || 'Could not reach the endpoint.' });
    } finally {
      setFetching(false);
    }
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setLocalFile(file);
    if (file) {
      setGgufUrl('');
      if (!ggufName.trim()) setGgufName(file.name);
    }
    event.target.value = '';
  };

  const handleSave = () => {
    setLocalGgufFile(localFile);
    onSave({
      openai: { baseUrl, apiKey, model: remoteModel },
      gguf: { name: ggufName, url: ggufUrl },
      selectedModelId: settings.selectedModelId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Model Settings</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Add your own GGUF model or connect a model hosted elsewhere. Settings stay in this
              browser.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Close model settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* OpenAI-compatible endpoint */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              OpenAI-compatible API
            </h4>
          </div>

          <div className="mb-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <Radar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Servers on this machine</span>
              </div>
              <button
                type="button"
                onClick={runDetection}
                disabled={detecting}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 disabled:opacity-50"
              >
                {detecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span>{detecting ? 'Scanning…' : 'Scan again'}</span>
              </button>
            </div>

            {detected && detected.length === 0 && (
              <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                Nothing found on ports 1234 (LM Studio), 8080 (llama.cpp), 11434 (Ollama) or 8000
                (vLLM). Start one and make sure it accepts requests from this page (CORS).
              </p>
            )}

            {detected && detected.length > 0 && (
              <div className="mt-1.5 space-y-1.5">
                {detected.map((server) => (
                  <div key={server.baseUrl} className="space-y-1">
                    <div className="flex items-baseline gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {server.label}
                      </span>
                      <span className="font-mono">{server.baseUrl.replace(/^https?:\/\//, '')}</span>
                    </div>
                    {server.models.length === 0 ? (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        Running, but no model is loaded.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {server.models.map((model) => {
                          const active = sameEndpoint(baseUrl, server.baseUrl) && remoteModel === model;
                          return (
                            <button
                              key={model}
                              type="button"
                              onClick={() => {
                                setBaseUrl(server.baseUrl);
                                setRemoteModel(model);
                                setFetchResult(null);
                              }}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border transition-colors ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                              }`}
                            >
                              {model}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-slate-400">
                  Detected models also appear in the header picker.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Base URL
              </label>
              <div className="relative">
                <Link2 className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:8080/v1"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Include the API path (usually <span className="font-mono">/v1</span>). llama.cpp
                server, LM Studio, Ollama, vLLM and hosted APIs all work.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Model name
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={remoteModel}
                  onChange={(e) => setRemoteModel(e.target.value)}
                  placeholder="e.g. lfm3-v1-2b"
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetching || !baseUrl.trim()}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-semibold border border-slate-200 dark:border-slate-700"
                  title="List models available at this endpoint"
                >
                  {fetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>Fetch</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                API key (optional)
              </label>
              <div className="relative">
                <KeyRound className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {remoteModels.length > 0 && (
            <select
              value={remoteModels.includes(remoteModel) ? remoteModel : ''}
              onChange={(e) => e.target.value && setRemoteModel(e.target.value)}
              className="mt-2 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="">Select a discovered model…</option>
              {remoteModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}

          {fetchResult && (
            <div
              className={`mt-2 flex items-start gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 ${
                fetchResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
              }`}
            >
              {fetchResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              <span className="break-words">{fetchResult.message}</span>
            </div>
          )}
        </section>

        {/* Custom GGUF */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Your own GGUF model
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Display name
              </label>
              <input
                type="text"
                value={ggufName}
                onChange={(e) => setGgufName(e.target.value)}
                placeholder="e.g. My fine-tuned 2B"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                GGUF from disk
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 truncate"
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{localFile ? localFile.name : 'Choose .gguf file'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".gguf"
                onChange={handleFilePick}
                className="hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                …or download from a direct URL
              </label>
              <div className="relative">
                <Link2 className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ggufUrl}
                  onChange={(e) => {
                    setGgufUrl(e.target.value);
                    if (e.target.value.trim()) setLocalFile(null);
                  }}
                  placeholder="https://huggingface.co/…/resolve/main/model-Q4_K_M.gguf"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Runs through llama.cpp in the browser. Downloads are cached by the browser; a file
                picked from disk must be re-selected after a reload. The bundled runtime is{' '}
                <span className="font-mono">{getGgufRuntimeLabel()}</span>.
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
};
