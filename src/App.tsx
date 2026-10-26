import React, { useState, useEffect } from 'react';
import { db, deleteDocumentWithChunks } from './lib/db';
import { DocumentItem, ModelStatus } from './lib/types';
import { AVAILABLE_MODELS, llmEngine } from './lib/llm/engine';
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
import { InspectorView } from './components/views/InspectorView';
import { Menu } from 'lucide-react';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [selectedModelId, setSelectedModelId] = useState<string>(
    AVAILABLE_MODELS.find((m) => m.default)?.id || AVAILABLE_MODELS[0].id
  );
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

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDocumentWithChunks(docId);
      globalRetriever.removeDocChunks(docId);
      if (selectedDocId === docId) {
        setSelectedDocId(null);
      }
      await loadDocumentsAndChunks();
    } catch (err) {
      console.error('Failed to delete document:', err);
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
    // If a model is already loaded, switch to the new one
    if (modelStatus.state === 'ready') {
      try {
        await llmEngine.loadModel(modelId);
      } catch (err) {
        console.error('Model switch error:', err);
      }
    }
  };

  const currentModelObj = AVAILABLE_MODELS.find((m) => m.id === selectedModelId) || AVAILABLE_MODELS[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Header */}
      <Header
        modelStatus={modelStatus}
        selectedModelId={selectedModelId}
        onSelectModel={handleModelSelect}
        onLoadModel={handleInitializeModel}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onEmbeddingModelChange={() => {
          // Re-hydrate or notify
        }}
      />

      {/* Model status / download progress banner */}
      <ModelStatusBanner
        modelStatus={modelStatus}
        selectedModelName={currentModelObj.name}
      />

      {/* Main App Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Knowledge Base Sidebar */}
        <Sidebar
          documents={documents}
          selectedDocId={selectedDocId}
          onSelectDoc={(id) => setSelectedDocId(id)}
          onUploadFile={handleUploadFile}
          onAddNote={handleAddNote}
          onLoadSample={loadSampleDocument}
          onDeleteDoc={handleDeleteDoc}
          ingestionProgress={ingestionProgress}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Content Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Navigation Bar & Mobile menu toggle */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Toggle Knowledge Base"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1">
              <NavigationTabs
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab)}
                documentCount={documents.length}
              />
            </div>
          </div>

          {/* Active View */}
          <div className="flex-1 flex flex-col">
            {activeTab === 'chat' && (
              <ChatView
                documents={documents}
                selectedDocId={selectedDocId}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'summary' && (
              <SummaryView
                documents={documents}
                selectedDocId={selectedDocId}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'notes' && (
              <NotesView
                documents={documents}
                selectedDocId={selectedDocId}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'quiz' && (
              <QuizView
                documents={documents}
                selectedDocId={selectedDocId}
                modelStatus={modelStatus}
                onInitializeModel={handleInitializeModel}
              />
            )}

            {activeTab === 'inspector' && (
              <InspectorView documents={documents} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
