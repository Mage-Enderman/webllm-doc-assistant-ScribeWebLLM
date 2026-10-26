import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Layers,
  RotateCcw,
  BookOpen,
  Copy,
  Check,
  FileText,
  Columns,
  X,
  ExternalLink,
} from 'lucide-react';
import { ChatMessage, CitationItem, DocumentItem, ModelStatus } from '../../lib/types';
import { globalRetriever } from '../../lib/rag/retriever';
import { assembleContextForPrompt, buildGroundedChatPrompt } from '../../lib/rag/harness';
import { llmEngine } from '../../lib/llm/engine';
import { DocumentViewer } from '../document/DocumentViewer';

interface ChatViewProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  documents,
  selectedDocId,
  modelStatus,
  onInitializeModel,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your in-browser AI learning assistant running locally via WebGPU. Upload or paste notes, or click **"Load RAG Guide"** on the left, then ask me anything about your documents!',
      timestamp: Date.now(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSplitView, setShowSplitView] = useState(false);
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Keep viewingDoc synced with selected document or fallback
  useEffect(() => {
    if (selectedDoc) {
      setViewingDoc(selectedDoc);
    } else if (documents.length > 0 && !viewingDoc) {
      setViewingDoc(documents[0]);
    }
  }, [selectedDocId, documents]);

  const handleCitationClick = (cite: CitationItem) => {
    const doc = documents.find((d) => d.id === cite.docId) || selectedDoc || documents[0];
    if (doc) {
      setViewingDoc(doc);
    }
    setHighlightChunkId(cite.chunkId);
    setShowSplitView(true);
  };

  const handleSendMessage = async (queryText?: string) => {
    const query = (queryText || inputPrompt).trim();
    if (!query || isGenerating) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    if (documents.length === 0) {
      alert('Please upload or load a document first into your Knowledge Base!');
      return;
    }

    const userMsgId = 'msg_' + Date.now();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsGenerating(true);

    try {
      // 1. Hybrid Search via Small-Model Harness
      const searchResults = await globalRetriever.search(query, {
        topK: 5,
        docIdFilter: selectedDocId || undefined,
      });

      // 2. Strict Context Assembly & Deduplication
      const { contextText, citations } = assembleContextForPrompt(searchResults);

      // 3. Delimited Prompt Construction
      const { system, user } = buildGroundedChatPrompt(contextText, query);

      const assistantMsgId = 'msg_ai_' + Date.now();
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        citations,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // 4. Stream response from WebLLM WebWorker
      let fullContent = '';
      const stream = llmEngine.streamChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { temperature: 0.2, max_tokens: 750 }
      );

      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
        );
      }
    } catch (err: any) {
      console.error('Chat generation error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: `⚠️ Generation error: ${err.message || 'Please check that the WebGPU model is loaded.'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Chat cleared! What topic would you like to explore in your documentation?',
        timestamp: Date.now(),
      },
    ]);
  };

  const samplePrompts = [
    'What are the key concepts explained in this document?',
    'Summarize the main architectural flow and steps.',
    'Explain the advantages and limitations mentioned.',
  ];

  return (
    <div className="flex-1 flex h-[calc(100vh-8.5rem)] w-full overflow-hidden">
      {/* Main Chat Column */}
      <div className={`flex-1 flex flex-col p-4 overflow-hidden transition-all duration-300 ${showSplitView ? 'max-w-2xl xl:max-w-3xl' : 'max-w-5xl mx-auto'}`}>
        {/* Scope and controls bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 text-xs gap-2">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 min-w-0">
            <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">
              Active Context Scope:{' '}
              <strong className="text-slate-900 dark:text-white">
                {selectedDoc ? selectedDoc.title : 'All Loaded Documents'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Split Screen Document Viewer Toggle */}
            {documents.length > 0 && (
              <button
                onClick={() => setShowSplitView(!showSplitView)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  showSplitView
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Toggle side-by-side document reader"
              >
                <Columns className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Split Reader</span>
              </button>
            )}

            <button
              onClick={clearChat}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition-colors px-2 py-1 rounded"
              title="Clear conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {messages.map((message) => {
            const isAi = message.role === 'assistant';

            return (
              <div
                key={message.id}
                className={`flex gap-3 max-w-3xl ${isAi ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
              >
                {/* Avatar */}
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    isAi
                      ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white'
                      : 'bg-slate-800 text-white dark:bg-slate-700'
                  }`}
                >
                  {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`group relative rounded-2xl px-4 py-3 text-sm transition-all ${
                    isAi
                      ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>

                  {/* Grounded Citations Chips */}
                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                        <Layers className="h-3 w-3 text-indigo-500" />
                        Grounded Sources ({message.citations.length}) — Click to view in document:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {message.citations.map((cite, idx) => (
                          <button
                            key={cite.chunkId}
                            onClick={() => handleCitationClick(cite)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs"
                            title="Open side-by-side document and highlight source"
                          >
                            <FileText className="h-3 w-3" />
                            <span>
                              Source {idx + 1}
                              {cite.page ? ` (p.${cite.page})` : ''}
                            </span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copy button */}
                  <button
                    onClick={() => copyToClipboard(message.content, message.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-opacity"
                    title="Copy response"
                  >
                    {copiedId === message.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div className="flex gap-3 max-w-3xl mr-auto items-center text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 animate-spin" />
                Thinking and formulating answer using retrieved context...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested prompt chips */}
        {messages.length <= 2 && (
          <div className="py-2 flex flex-wrap gap-1.5">
            {samplePrompts.map((p) => (
              <button
                key={p}
                onClick={() => handleSendMessage(p)}
                disabled={isGenerating}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm"
              >
                💡 {p}
              </button>
            ))}
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="pt-2"
        >
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder={
                modelStatus.state !== 'ready'
                  ? 'Click "Initialize" in header to activate browser AI model...'
                  : 'Ask a question about your uploaded documentation...'
              }
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-4 pr-12 py-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />

            <button
              type="submit"
              disabled={isGenerating || !inputPrompt.trim()}
              className="absolute right-2 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-all shadow-sm"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            Responses are strictly grounded in your retrieved document chunks to eliminate hallucinations.
          </p>
        </form>
      </div>

      {/* Split-Screen Document Viewer Pane */}
      {showSplitView && (
        <div className="w-[45%] h-full shrink-0 animate-in slide-in-from-right duration-300">
          <DocumentViewer
            document={viewingDoc || selectedDoc || documents[0] || null}
            highlightChunkId={highlightChunkId}
            onClose={() => setShowSplitView(false)}
          />
        </div>
      )}
    </div>
  );
};
