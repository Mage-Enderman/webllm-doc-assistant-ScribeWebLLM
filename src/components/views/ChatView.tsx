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
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { ChatMessage, CitationItem, DocumentItem, ModelStatus } from '../../lib/types';
import { globalRetriever } from '../../lib/rag/retriever';
import { assembleContextForPrompt, buildGroundedChatPrompt } from '../../lib/rag/harness';
import { llmEngine } from '../../lib/llm/engine';

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
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

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
    <div className="flex-1 flex flex-col h-[calc(100vh-8.5rem)] max-w-5xl mx-auto w-full p-4">
      {/* Scope banner */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>
            Active Context Scope:{' '}
            <strong className="text-slate-900 dark:text-white">
              {selectedDoc ? selectedDoc.title : 'All Loaded Documents'}
            </strong>
          </span>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition-colors"
          title="Clear conversation"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
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

                {/* Citations Chips */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                      <Layers className="h-3 w-3 text-indigo-500" />
                      Grounded Sources ({message.citations.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {message.citations.map((cite, idx) => (
                        <button
                          key={cite.chunkId}
                          onClick={() => setActiveCitation(cite)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          <span>
                            Source {idx + 1}
                            {cite.page ? ` (p.${cite.page})` : ''}
                          </span>
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

      {/* Citation Modal */}
      {activeCitation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <FileText className="h-5 w-5" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeCitation.docTitle}
                </h3>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap">
              {activeCitation.textSnippet}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>{activeCitation.page ? `Page ${activeCitation.page}` : 'Document Chunk'}</span>
              <span>RRF Score: {activeCitation.score.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
