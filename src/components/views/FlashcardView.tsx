import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Brain,
  Sparkles,
  Plus,
  Trash2,
  Download,
  RotateCw,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  ChevronLeft,
  Filter,
  Search,
  BookOpen,
} from 'lucide-react';
import { DocumentItem, ModelStatus, Flashcard } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import {
  buildSingleFlashcardPrompt,
  parseFlashcardItems,
  calculateNextReview,
} from '../../lib/rag/harness';

interface FlashcardViewProps {
  documents: DocumentItem[];
  selectedDocId?: string | null;
  selectedDocIds?: string[];
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({
  documents,
  selectedDocId,
  selectedDocIds = [],
  modelStatus,
  onInitializeModel,
}) => {
  const [activeDocId, setActiveDocId] = useState<string>(() => {
    if (selectedDocIds.length > 1) return 'group';
    if (selectedDocId) return selectedDocId;
    return 'all';
  });
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [viewMode, setViewMode] = useState<'study' | 'browse'>('study');
  const [studyFilter, setStudyFilter] = useState<'due' | 'all'>('due');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [cardCountToGenerate, setCardCountToGenerate] = useState(5);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  // Study state
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyFinished, setStudyFinished] = useState(false);
  const [reviewedSessionCount, setReviewedSessionCount] = useState(0);

  // Manual card creation
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newDocId, setNewDocId] = useState(documents[0]?.id || '');

  // Search filter for browse mode
  const [searchQuery, setSearchQuery] = useState('');

  // Load flashcards from IndexedDB
  const loadFlashcards = useCallback(async () => {
    try {
      let cards: Flashcard[] = [];
      if (activeDocId === 'all') {
        cards = await db.flashcards.toArray();
      } else if (activeDocId === 'group' && selectedDocIds.length > 0) {
        cards = await db.flashcards.where('docId').anyOf(selectedDocIds).toArray();
      } else {
        cards = await db.flashcards.where('docId').equals(activeDocId).toArray();
      }
      // Sort: due cards first, then by creation date
      cards.sort((a, b) => a.dueDate - b.dueDate);
      setFlashcards(cards);
    } catch (err) {
      console.error('Failed to load flashcards:', err);
    }
  }, [activeDocId, selectedDocIds]);

  useEffect(() => {
    loadFlashcards();
  }, [loadFlashcards]);

  useEffect(() => {
    if (selectedDocIds.length > 1) {
      setActiveDocId('group');
    } else if (selectedDocId) {
      setActiveDocId(selectedDocId);
    }
  }, [selectedDocIds, selectedDocId]);

  // Statistics
  const stats = useMemo(() => {
    const now = Date.now();
    const total = flashcards.length;
    const due = flashcards.filter((c) => c.dueDate <= now).length;
    const mastered = flashcards.filter((c) => c.repetition >= 3).length;
    const learning = total - mastered;
    return { total, due, mastered, learning };
  }, [flashcards]);

  // Cards for study
  const studyDeck = useMemo(() => {
    const now = Date.now();
    if (studyFilter === 'due') {
      return flashcards.filter((c) => c.dueDate <= now);
    }
    return flashcards;
  }, [flashcards, studyFilter]);

  const currentCard = studyDeck[currentStudyIndex];

  // Reset study state when filter or deck changes
  const startStudySession = (filter: 'due' | 'all') => {
    setStudyFilter(filter);
    setCurrentStudyIndex(0);
    setIsFlipped(false);
    setStudyFinished(false);
    setReviewedSessionCount(0);
    setViewMode('study');
  };

  // Keyboard navigation for study
  useEffect(() => {
    if (viewMode !== 'study' || studyFinished || !currentCard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === '1') {
          handleRateCard('again');
        } else if (e.key === '2') {
          handleRateCard('good');
        } else if (e.key === '3') {
          handleRateCard('easy');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isFlipped, currentCard, studyFinished]);

  // Rate card with SM-2
  const handleRateCard = async (grade: 'again' | 'good' | 'easy') => {
    if (!currentCard) return;

    const nextSM2 = calculateNextReview(currentCard, grade);
    const updatedCard: Flashcard = {
      ...currentCard,
      ...nextSM2,
    };

    // Update in Dexie
    await db.flashcards.put(updatedCard);

    // Update in local state
    setFlashcards((prev) =>
      prev.map((c) => (c.id === updatedCard.id ? updatedCard : c))
    );

    setReviewedSessionCount((prev) => prev + 1);
    setIsFlipped(false);

    if (currentStudyIndex + 1 < studyDeck.length) {
      setCurrentStudyIndex((prev) => prev + 1);
    } else {
      setStudyFinished(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    }
  };

  // AI Generation of flashcards
  const handleGenerateCards = async () => {
    const targetDocs: DocumentItem[] = [];
    if (activeDocId === 'group') {
      targetDocs.push(...documents.filter((d) => selectedDocIds.includes(d.id)));
    } else if (activeDocId === 'all') {
      targetDocs.push(...documents);
    } else {
      const doc = documents.find((d) => d.id === activeDocId);
      if (doc) targetDocs.push(doc);
    }
    if (targetDocs.length === 0 && documents.length > 0) {
      targetDocs.push(documents[0]);
    }
    if (targetDocs.length === 0) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsGenerating(true);
    setGenProgress({
      current: 0,
      total: cardCountToGenerate,
      message: 'Sampling key chunks across scope...',
    });

    try {
      const targetDocIds = targetDocs.map((d) => d.id);
      const allChunks = await db.chunks
        .where('docId')
        .anyOf(targetDocIds)
        .sortBy('chunkIndex');

      if (allChunks.length === 0) {
        throw new Error('No chunks found for the selected scope.');
      }

      // Sample evenly
      const step = Math.max(1, Math.floor(allChunks.length / cardCountToGenerate));
      const selectedChunks: typeof allChunks = [];
      for (let i = 0; i < cardCountToGenerate && i * step < allChunks.length; i++) {
        selectedChunks.push(allChunks[i * step]);
      }
      for (const c of allChunks) {
        if (selectedChunks.length >= cardCountToGenerate) break;
        if (!selectedChunks.some((sc) => sc.id === c.id)) {
          selectedChunks.push(c);
        }
      }

      const generatedCards: Flashcard[] = [];

      for (let i = 0; i < selectedChunks.length; i++) {
        setGenProgress({
          current: i + 1,
          total: selectedChunks.length,
          message: `Distilling concept ${i + 1} of ${selectedChunks.length}...`,
        });

        const chunk = selectedChunks[i];
        const sourceDoc = targetDocs.find((d) => d.id === chunk.docId) || targetDocs[0];
        const { system, user } = buildSingleFlashcardPrompt(chunk.text);

        const rawJson = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          {
            max_tokens: 380,
            temperature: 0.2,
          }
        );

        const parsed = parseFlashcardItems(rawJson, sourceDoc.id, sourceDoc.title);
        for (const card of parsed) {
          generatedCards.push(card);
          await db.flashcards.put(card);
        }
      }

      await loadFlashcards();
      startStudySession('all');
    } catch (err: any) {
      console.error('Flashcard generation error:', err);
      alert(`Generation notice: ${err.message || 'Small model hiccup while formatting flashcards.'}`);
    } finally {
      setIsGenerating(false);
      setGenProgress(null);
    }
  };

  // Add custom manual card
  const handleAddCustomCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;

    const doc = documents.find((d) => d.id === newDocId) || documents[0];
    const newCard: Flashcard = {
      id: `card_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      docId: doc?.id || 'manual',
      docTitle: doc?.title || 'Manual Notes',
      front: newFront.trim(),
      back: newBack.trim(),
      interval: 1,
      repetition: 0,
      easeFactor: 2.5,
      dueDate: Date.now(),
      createdAt: Date.now(),
    };

    await db.flashcards.put(newCard);
    await loadFlashcards();
    setNewFront('');
    setNewBack('');
    setShowAddModal(false);
  };

  const handleDeleteCard = async (id: string) => {
    await db.flashcards.delete(id);
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to remove all flashcards in this view?')) return;
    if (activeDocId === 'all') {
      await db.flashcards.clear();
      setFlashcards([]);
    } else {
      await db.flashcards.where('docId').equals(activeDocId).delete();
      await loadFlashcards();
    }
  };

  // Export handlers
  const exportToAnkiCSV = () => {
    if (flashcards.length === 0) return;
    // Anki CSV format: front,back (quoted if contains commas/newlines)
    const rows = flashcards.map((c) => {
      const frontClean = `"${c.front.replace(/"/g, '""')}"`;
      const backClean = `"${c.back.replace(/"/g, '""')}"`;
      return `${frontClean},${backClean}`;
    });
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `flashcards-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToMarkdown = () => {
    if (flashcards.length === 0) return;
    let md = `# Flashcards (${flashcards.length} cards)\n\n`;
    flashcards.forEach((c, idx) => {
      md += `### Card ${idx + 1}: ${c.front}\n`;
      md += `**Answer:**\n${c.back}\n\n`;
      md += `*Document: ${c.docTitle} | Interval: ${c.interval}d | Repetitions: ${c.repetition}*\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `flashcards-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered browse cards
  const browseCards = useMemo(() => {
    if (!searchQuery.trim()) return flashcards;
    const q = searchQuery.toLowerCase();
    return flashcards.filter(
      (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
    );
  }, [flashcards, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Header & Deck Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl ring-1 ring-indigo-500/20">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  Flashcard Arena
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                  SM-2 Spaced Repetition
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Active recall system powered by SuperMemo-2 spaced intervals
              </p>
            </div>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {stats.due} Due
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {stats.mastered} Mastered
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {stats.total} Total
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="max-w-6xl mx-auto mt-4 flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Scope / Group Select */}
            <select
              value={activeDocId}
              onChange={(e) => setActiveDocId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">📚 All Documents ({stats.total} cards)</option>
              {selectedDocIds.length > 1 && (
                <option value="group">
                  📁 Active Group ({selectedDocIds.length} docs)
                </option>
              )}
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  📄 {d.title}
                </option>
              ))}
            </select>

            {/* Mode Tabs */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('study')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'study'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Study Deck
              </button>
              <button
                onClick={() => setViewMode('browse')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'browse'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Manage & Search ({flashcards.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Generate Flashcards Button */}
            {documents.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={cardCountToGenerate}
                  onChange={(e) => setCardCountToGenerate(Number(e.target.value))}
                  disabled={isGenerating}
                  className="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  <option value={3}>3 cards</option>
                  <option value={5}>5 cards</option>
                  <option value={8}>8 cards</option>
                </select>
                <button
                  onClick={handleGenerateCards}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {isGenerating ? (
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>Generate Cards</span>
                </button>
              </div>
            )}

            {/* Custom Card Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Card</span>
            </button>

            {/* Export Dropdown / Buttons */}
            {flashcards.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={exportToAnkiCSV}
                  title="Export deck to Anki-compatible CSV"
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Generation Progress Bar */}
        {isGenerating && genProgress && (
          <div className="max-w-6xl mx-auto mt-4 p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl">
            <div className="flex justify-between items-center text-xs text-indigo-700 dark:text-indigo-300 mb-1.5 font-medium">
              <span>{genProgress.message}</span>
              <span>
                {genProgress.current} / {genProgress.total}
              </span>
            </div>
            <div className="w-full bg-indigo-200/60 dark:bg-indigo-900/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(genProgress.current / genProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {viewMode === 'study' ? (
          /* STUDY MODE */
          <div className="w-full flex flex-col items-center">
            {flashcards.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-md w-full">
                <Brain className="h-12 w-12 text-slate-400 mx-auto mb-3 stroke-[1.5]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  No flashcards found
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
                  Select a document above and click "Generate Cards" to extract high-yield active recall flashcards using small in-browser models.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200"
                  >
                    + Create Card Manually
                  </button>
                  {documents.length > 0 && (
                    <button
                      onClick={handleGenerateCards}
                      disabled={isGenerating}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm"
                    >
                      Generate with AI
                    </button>
                  )}
                </div>
              </div>
            ) : studyDeck.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-md w-full">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  You are all caught up!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
                  No cards are currently due for review under the SM-2 spaced repetition schedule.
                </p>
                <button
                  onClick={() => startStudySession('all')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm"
                >
                  Review All {flashcards.length} Cards Anyway
                </button>
              </div>
            ) : studyFinished ? (
              /* Review Finished Celebration */
              <div className="text-center py-12 px-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md max-w-md w-full animate-fade-in">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Session Completed!
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
                  You reviewed <strong className="text-indigo-600 dark:text-indigo-400">{reviewedSessionCount} cards</strong>. Your next review intervals have been updated according to SM-2 spaced repetition memory retention curves.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => startStudySession('all')}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm"
                  >
                    Study Full Deck Again
                  </button>
                  <button
                    onClick={() => setViewMode('browse')}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                  >
                    View All Flashcards
                  </button>
                </div>
              </div>
            ) : (
              /* Active 3D Flashcard */
              <div className="w-full max-w-xl flex flex-col items-center">
                {/* Deck progress header */}
                <div className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Card {currentStudyIndex + 1} of {studyDeck.length}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-medium">
                      Interval: {currentCard.interval}d
                    </span>
                  </div>
                  <span className="truncate max-w-[200px]" title={currentCard.docTitle}>
                    📄 {currentCard.docTitle}
                  </span>
                </div>

                {/* Card Container (Click to flip) */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="w-full min-h-[300px] sm:min-h-[340px] bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-3xl p-6 sm:p-8 flex flex-col justify-between cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300 relative group select-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                      {isFlipped ? 'Answer / Solution' : 'Question / Prompt'}
                    </span>
                    <span className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors flex items-center gap-1">
                      <RotateCw className="h-3 w-3" />
                      <span>{isFlipped ? 'Click to see front' : 'Click or Space to flip'}</span>
                    </span>
                  </div>

                  {/* Question or Answer Content */}
                  <div className="my-auto py-6">
                    {isFlipped ? (
                      <div className="animate-fade-in">
                        <p className="text-base sm:text-lg font-medium text-slate-900 dark:text-white leading-relaxed">
                          {currentCard.back}
                        </p>
                      </div>
                    ) : (
                      <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed text-center">
                        {currentCard.front}
                      </p>
                    )}
                  </div>

                  {/* Card footer details */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Repetition #{currentCard.repetition}</span>
                    <span>Ease: {currentCard.easeFactor.toFixed(1)}x</span>
                  </div>
                </div>

                {/* Spaced Repetition Rating Buttons */}
                <div className="w-full mt-6">
                  {isFlipped ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-center text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                        How well did you recall this? (Press 1, 2, or 3)
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          onClick={() => handleRateCard('again')}
                          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 transition-all font-semibold"
                        >
                          <span className="text-sm font-bold">Again</span>
                          <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                            &lt; 1 day (Reset)
                          </span>
                        </button>
                        <button
                          onClick={() => handleRateCard('good')}
                          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 transition-all font-semibold"
                        >
                          <span className="text-sm font-bold">Good</span>
                          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                            {currentCard.repetition === 0 ? '1 day' : `${Math.round(currentCard.interval * currentCard.easeFactor)} days`}
                          </span>
                        </button>
                        <button
                          onClick={() => handleRateCard('easy')}
                          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 transition-all font-semibold"
                        >
                          <span className="text-sm font-bold">Easy</span>
                          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                            {currentCard.repetition === 0 ? '2 days' : `${Math.round(currentCard.interval * currentCard.easeFactor * 1.3)} days`}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsFlipped(true)}
                      className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <span>Show Answer</span>
                      <span className="text-xs opacity-75 font-normal">(Spacebar)</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* BROWSE & MANAGE MODE */
          <div className="w-full flex flex-col gap-4">
            {/* Search and Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={exportToMarkdown}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Markdown</span>
                </button>
                <button
                  onClick={exportToAnkiCSV}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Anki</span>
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/40 text-xs font-semibold text-rose-700 dark:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {/* Flashcard list */}
            {browseCards.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No flashcards match your filter.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {browseCards.map((card) => {
                  const isDue = card.dueDate <= Date.now();
                  const dueDateString = new Date(card.dueDate).toLocaleDateString();

                  return (
                    <div
                      key={card.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow relative group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                            📄 {card.docTitle}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isDue ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200 dark:border-amber-900/40">
                                Due
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                                In {Math.max(1, Math.round((card.dueDate - Date.now()) / 86400000))}d
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteCard(card.id)}
                              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg transition-colors"
                              title="Delete card"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                          Q: {card.front}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                          {card.back}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Interval: {card.interval}d</span>
                        <span>Reps: {card.repetition}</span>
                        <span>Ease: {card.easeFactor.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Card Creation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Add New Flashcard
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Create a custom recall card attached to your knowledge base.
            </p>

            <form onSubmit={handleAddCustomCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Associated Document
                </label>
                <select
                  value={newDocId}
                  onChange={(e) => setNewDocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Card Front (Question / Prompt)
                </label>
                <textarea
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  placeholder="e.g., What is the primary purpose of the page file?"
                  rows={2}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Card Back (Answer / Explanation)
                </label>
                <textarea
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  placeholder="e.g., To store modified pages that are not currently in use, freeing physical RAM."
                  rows={3}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
                >
                  Save Flashcard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
