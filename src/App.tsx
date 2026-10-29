import React, { useState, useEffect } from 'react';
import { db, deleteDocumentWithChunks, deleteDocumentsWithChunks, clearAllData } from './lib/db';
import { DocumentItem, ModelStatus } from './lib/types';
import {
  getAvailableModels,
  getDefaultModelId,
  llmEngine,
  setDiscoveredServers,
} from './lib/llm/engine';
import { discoverLocalServers } from './lib/llm/discovery';
import {
  LLMSettings,
  loadLLMSettings,
  saveLLMSettings,
} from './lib/llm/settings';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import { globalRetriever } from './lib/rag/retriever';
import { processAndIngestDocument, IngestionProgress } from './lib/ingestion/documentProcessor';
import { SAMPLE_DOCUMENTS } from './lib/sampleDocs';
import { Header } from './components/Header';
import { ModelStatusBanner } from './components/ModelStatusBanner';
import { NavigationTabs, ActiveTab } from './components/NavigationTabs';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/views/ChatView';
import { SummaryView } from './components/views/SummaryView';
import { NotesView } from './components/views/NotesView';
import { QuizView } from './components/views/QuizView';
import { FlashcardView } from './components/views/FlashcardView';
import { ConceptGraphView } from './components/views/ConceptGraphView';
import { InspectorView } from './components/views/InspectorView';
import { BundleModal } from './components/workspace/BundleModal';
import { Menu } from 'lucide-react';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const selectedDocId = selectedDocIds.length === 1 ? selectedDocIds[0] : null;
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => loadLLMSettings());
  const [models, setModels] = useState(() => getAvailableModels());
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const available = getAvailableModels();
    const persisted = loadLLMSettings().selectedModelId;
    if (persisted && available.some((m) => m.id === persisted)) return persisted;
    return getDefaultModelId();
  });
  const [modelStatus, setModelStatus] = useState<ModelStatus>(llmEngine.getStatus());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState<IngestionProgress | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });

  // Apply dark mode class to html root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Subscribe to LLM Engine status
  useEffect(() => {
    const unsubscribe = llmEngine.subscribeStatus((status) => {
      setModelStatus(status);
    });
    return unsubscribe;
  }, []);

  // Load documents and hydrate hybrid retriever on mount
  useEffect(() => {
    loadDocumentsAndChunks();
  }, []);

  // Offer models from OpenAI-compatible servers already running on this machine
  useEffect(() => {
    let cancelled = false;
    discoverLocalServers().then((servers) => {
      if (cancelled) return;
      setDiscoveredServers(servers);
      const nextModels = getAvailableModels();
      setModels(nextModels);
      // A model selected from a detected server only resolves once discovery runs.
      const persisted = loadLLMSettings().selectedModelId;
      if (persisted && nextModels.some((m) => m.id === persisted)) {
        setSelectedModelId(persisted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDocumentsAndChunks = async () => {
    try {
      const allDocs = await db.documents.orderBy('createdAt').reverse().toArray();
      setDocuments(allDocs);

      const allChunks = await db.chunks.toArray();
      globalRetriever.setChunks(allChunks);

      // Auto load sample document if first-time user has no documents
      if (allDocs.length === 0) {
        await loadSampleDocument(0);
      }
    } catch (err) {
      console.error('Failed to load documents from database:', err);
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      const docType = file.name.endsWith('.pdf')
        ? 'pdf'
        : file.name.endsWith('.md')
        ? 'markdown'
        : 'text';

      await processAndIngestDocument(
        { name: file.name, type: docType, file },
        (progress) => setIngestionProgress(progress)
      );

      await loadDocumentsAndChunks();
    } catch (err: any) {
      alert(`Ingestion error: ${err.message || 'Failed to process file'}`);
    } finally {
      setTimeout(() => setIngestionProgress(null), 1000);
    }
  };

  const handleAddNote = async (title: string, content: string) => {
    try {
      await processAndIngestDocument(
        { name: title, type: 'note', content },
        (progress) => setIngestionProgress(progress)
      );

      await loadDocumentsAndChunks();
    } catch (err: any) {
      alert(`Note creation failed: ${err.message}`);
    } finally {
      setTimeout(() => setIngestionProgress(null), 1000);
    }
  };

  const loadSampleDocument = async (sampleIndex: number) => {
    const sample = SAMPLE_DOCUMENTS[sampleIndex] || SAMPLE_DOCUMENTS[0];
    try {
      await processAndIngestDocument(
        { name: sample.title, type: sample.type, content: sample.content },
        (progress) => setIngestionProgress(progress)
      );

      await loadDocumentsAndChunks();
    } catch (err: any) {
      console.error('Failed to load sample document:', err);
    } finally {
      setTimeout(() => setIngestionProgress(null), 800);
    }
  };

  const handleToggleDocSelect = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleSelectSingleDoc = (docId: string | null) => {
    if (!docId) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds([docId]);
    }
  };

  const handleSelectAllDocs = () => {
    setSelectedDocIds(documents.map((d) => d.id));
  };

  const handleClearDocSelection = () => {
    setSelectedDocIds([]);
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDocumentWithChunks(docId);
      globalRetriever.removeDocChunks(docId);
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      await loadDocumentsAndChunks();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleDeleteDocs = async (docIds: string[]) => {
    try {
      await deleteDocumentsWithChunks(docIds);
      globalRetriever.removeDocChunks(docIds);
      setSelectedDocIds((prev) => prev.filter((id) => !docIds.includes(id)));
      await loadDocumentsAndChunks();
    } catch (err) {
      console.error('Failed to delete multiple documents:', err);
    }
  };

  const handleClearAllDocs = async () => {
    try {
      await clearAllData();
      globalRetriever.setChunks([]);
      setSelectedDocIds([]);
      await loadDocumentsAndChunks();
    } catch (err) {
      console.error('Failed to clear knowledge base:', err);
    }
  };

  const handleInitializeModel = async () => {
    try {
      await llmEngine.loadModel(selectedModelId);
    } catch (err) {
      // Error handled in banner status
    }
  };

  const handleModelSelect = async (modelId: string) => {
    setSelectedModelId(modelId);
    const nextSettings = { ...loadLLMSettings(), selectedModelId: modelId };
    saveLLMSettings(nextSettings);
    setLlmSettings(nextSettings);

    // If a model is already loaded, switch to the new one
    if (modelStatus.state === 'ready') {
      try {
        await llmEngine.loadModel(modelId);
      } catch (err) {
        console.error('Model switch error:', err);
      }
    }
  };

  const handleSaveModelSettings = (next: LLMSettings) => {
    saveLLMSettings(next);
    setLlmSettings(next);

    const nextModels = getAvailableModels();
    setModels(nextModels);

    if (!nextModels.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(getDefaultModelId());
    }
  };

  const currentModelObj =
    models.find((m) => m.id === selectedModelId) ||
    models.find((m) => m.id === getDefaultModelId()) ||
    models[0];

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Header */}
      <Header
        modelStatus={modelStatus}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleModelSelect}
        onLoadModel={handleInitializeModel}
        onOpenModelSettings={() => setModelSettingsOpen(true)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onEmbeddingModelChange={() => {
          // Re-hydrate or notify
        }}
      />

      {/* Model status / download progress banner */}
      <ModelStatusBanner
        modelStatus={modelStatus}
        selectedModel={currentModelObj}
        onOpenModelSettings={() => setModelSettingsOpen(true)}
      />

      {/* Main App Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Knowledge Base Sidebar */}
        <Sidebar
          documents={documents}
          selectedDocIds={selectedDocIds}
          onToggleDocSelect={handleToggleDocSelect}
          onSelectSingleDoc={handleSelectSingleDoc}
          onSelectAllDocs={handleSelectAllDocs}
          onClearDocSelection={handleClearDocSelection}
          onUploadFile={handleUploadFile}
          onAddNote={handleAddNote}
          onLoadSample={loadSampleDocument}
          onDeleteDoc={handleDeleteDoc}
          onDeleteDocs={handleDeleteDocs}
          onClearAllDocs={handleClearAllDocs}
          onOpenBundleModal={() => setBundleModalOpen(true)}
          ingestionProgress={ingestionProgress}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Content Workspace */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Fixed Top Navigation Bar & Mobile menu toggle */}
          <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur px-3 z-20">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Toggle Knowledge Base"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1 min-w-0">
              <NavigationTabs
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab)}
                documentCount={documents.length}
              />
            </div>
          </div>

          {/* Active View Container with internal vertical scroll */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {activeTab === 'chat' && (
              <ChatView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
                onDeleteDoc={handleDeleteDoc}
                initialPrompt={chatInitialPrompt}
                onClearInitialPrompt={() => setChatInitialPrompt(null)}
              />
            )}

            {activeTab === 'summary' && (
              <SummaryView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'notes' && (
              <NotesView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'quiz' && (
              <QuizView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'flashcards' && (
              <FlashcardView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'graph' && (
              <ConceptGraphView
                documents={documents}
                selectedDocId={selectedDocId}
                selectedDocIds={selectedDocIds}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
                onNavigateToChat={(prompt) => {
                  setChatInitialPrompt(prompt);
                  setActiveTab('chat');
                }}
              />
            )}

            {activeTab === 'inspector' && (
              <InspectorView documents={documents} />
            )}
          </div>
        </main>
      </div>

      {/* Model provider settings (GGUF / OpenAI-compatible) */}
      {modelSettingsOpen && (
        <ModelSettingsModal
          onClose={() => setModelSettingsOpen(false)}
          settings={llmSettings}
          onSave={handleSaveModelSettings}
        />
      )}

      {/* Workspace Pack (.scribe) Export & Import Modal */}
      <BundleModal
        isOpen={bundleModalOpen}
        onClose={() => setBundleModalOpen(false)}
        documents={documents}
        selectedDocIds={selectedDocIds}
        onImportSuccess={loadDocumentsAndChunks}
      />
    </div>
  );
};

export default App;
