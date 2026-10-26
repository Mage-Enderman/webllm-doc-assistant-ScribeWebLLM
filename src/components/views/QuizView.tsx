import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Award,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  Trophy,
  Layers,
} from 'lucide-react';
import { DocumentItem, ModelStatus, QuizQuestion } from '../../lib/types';
import { db } from '../../lib/db';
import { llmEngine } from '../../lib/llm/engine';
import {
  buildSingleQuestionPrompt,
  parseSingleQuizQuestion,
} from '../../lib/rag/harness';

interface QuizViewProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  modelStatus: ModelStatus;
  onInitializeModel: () => void;
}

export const QuizView: React.FC<QuizViewProps> = ({
  documents,
  selectedDocId,
  modelStatus,
  onInitializeModel,
}) => {
  const [activeDocId, setActiveDocId] = useState<string>(
    selectedDocId || (documents[0]?.id ?? '')
  );
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizProgress, setQuizProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isCompleted, setIsCompleted] = useState(false);

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];

  const handleGenerateQuiz = async () => {
    if (!activeDoc) return;

    if (modelStatus.state !== 'ready') {
      onInitializeModel();
      return;
    }

    setIsGenerating(true);
    setQuestions(null);
    setCurrentIndex(0);
    setUserAnswers({});
    setIsCompleted(false);

    try {
      const allChunks = await db.chunks
        .where('docId')
        .equals(activeDoc.id)
        .sortBy('chunkIndex');

      if (allChunks.length === 0) {
        throw new Error('No chunks found for this document.');
      }

      // Sample distinct concept chunks evenly across the document
      const step = Math.max(1, Math.floor(allChunks.length / questionCount));
      const selectedChunks: typeof allChunks = [];
      for (let i = 0; i < questionCount && i * step < allChunks.length; i++) {
        selectedChunks.push(allChunks[i * step]);
      }
      for (const c of allChunks) {
        if (selectedChunks.length >= questionCount) break;
        if (!selectedChunks.some((sc) => sc.id === c.id)) {
          selectedChunks.push(c);
        }
      }

      const generatedQuestions: QuizQuestion[] = [];

      // Progressive micro-tasking: Generate 1 high-quality question per chunk
      for (let i = 0; i < selectedChunks.length; i++) {
        setQuizProgress({
          current: i + 1,
          total: selectedChunks.length,
          message: `Crafting Question ${i + 1} of ${selectedChunks.length}...`,
        });

        const chunk = selectedChunks[i];
        const { system, user } = buildSingleQuestionPrompt(chunk.text);

        const rawJson = await llmEngine.completeChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.2, max_tokens: 450 }
        );

        const q = parseSingleQuizQuestion(rawJson);
        if (q && q.options.length === 4) {
          generatedQuestions.push(q);
        }
      }

      if (generatedQuestions.length === 0) {
        throw new Error('Could not generate quiz questions. Please try again or switch model.');
      }

      setQuestions(generatedQuestions);
    } catch (err: any) {
      console.error('Quiz generation error:', err);
      alert(`Quiz generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setQuizProgress(null);
    }
  };

  const handleSelectAnswer = (optionIdx: number) => {
    if (userAnswers[currentIndex] !== undefined) return;

    const updated = { ...userAnswers, [currentIndex]: optionIdx };
    setUserAnswers(updated);

    const isCurrentCorrect = optionIdx === questions![currentIndex].correctIndex;
    if (isCurrentCorrect) {
      confetti({
        particleCount: 25,
        spread: 45,
        origin: { y: 0.8 },
      });
    }
  };

  const handleNext = () => {
    if (!questions) return;
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  };

  const handleResetQuiz = () => {
    setCurrentIndex(0);
    setUserAnswers({});
    setIsCompleted(false);
  };

  const calculateScore = () => {
    if (!questions) return 0;
    let score = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctIndex) {
        score++;
      }
    });
    return score;
  };

  if (documents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Award className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          No Documents in Knowledge Base
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Upload a document to automatically generate comprehension quizzes.
        </p>
      </div>
    );
  }

  const currentQ = questions ? questions[currentIndex] : null;
  const hasAnsweredCurrent = userAnswers[currentIndex] !== undefined;
  const score = calculateScore();

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full p-4 space-y-6">
      {/* Header & Generator Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Interactive Quiz Arena
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clean, verified 4-choice multiple choice questions generated directly from your notes using progressive micro-tasking.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              aria-label="Select Document for Quiz"
              value={activeDoc?.id || ''}
              onChange={(e) => setActiveDocId(e.target.value)}
              disabled={isGenerating}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-medium max-w-[180px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>

            <select
              aria-label="Select Number of Questions"
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              disabled={isGenerating}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-medium"
            >
              <option value={3}>3 Questions</option>
              <option value={5}>5 Questions</option>
              <option value={10}>10 Questions</option>
            </select>

            <button
              onClick={handleGenerateQuiz}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Start Quiz</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progressive Generation Bar */}
        {isGenerating && quizProgress && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 animate-pulse" />
                {quizProgress.message}
              </span>
              <span>
                {quizProgress.current} / {quizProgress.total}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(quizProgress.current / quizProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Quiz Area */}
      {questions && !isCompleted && currentQ && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          {/* Progress Header */}
          <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-slate-400">
              Current Score: {score} / {Object.keys(userAnswers).length}
            </span>
          </div>

          {/* Question Text */}
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
            {currentQ.question}
          </h3>

          {/* Options: Always exactly 4 clean options */}
          <div className="grid grid-cols-1 gap-2.5">
            {currentQ.options.map((option, optIdx) => {
              const isSelected = userAnswers[currentIndex] === optIdx;
              const isCorrect = optIdx === currentQ.correctIndex;

              let btnStyle =
                'border-slate-200 dark:border-slate-800 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200';

              if (hasAnsweredCurrent) {
                if (isCorrect) {
                  btnStyle =
                    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold';
                } else if (isSelected && !isCorrect) {
                  btnStyle =
                    'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-semibold';
                } else {
                  btnStyle = 'opacity-40 border-slate-200 dark:border-slate-800';
                }
              }

              return (
                <button
                  key={optIdx}
                  onClick={() => handleSelectAnswer(optIdx)}
                  disabled={hasAnsweredCurrent}
                  className={`w-full text-left p-3.5 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 ${btnStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-400 shrink-0">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{option}</span>
                  </div>

                  {hasAnsweredCurrent && isCorrect && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  )}
                  {hasAnsweredCurrent && isSelected && !isCorrect && (
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation Box */}
          {hasAnsweredCurrent && (
            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-4 border border-slate-200 dark:border-slate-700 animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                <HelpCircle className="h-4 w-4 text-indigo-500" />
                <span>Explanation & Context:</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {currentQ.explanation}
              </p>
            </div>
          )}

          {/* Footer Action */}
          {hasAnsweredCurrent && (
            <div className="flex justify-end pt-2">
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                <span>{currentIndex + 1 === questions.length ? 'See Final Score' : 'Next Question'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Completion Score Screen */}
      {isCompleted && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm space-y-4 animate-in zoom-in-95 duration-200">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shadow-lg">
            <Trophy className="h-8 w-8" />
          </div>

          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            Quiz Completed!
          </h3>

          <p className="text-sm text-slate-500">
            You scored <strong className="text-indigo-600 dark:text-indigo-400 font-mono text-base">{score}</strong> out of{' '}
            <strong className="font-mono text-base">{questions?.length}</strong> questions (
            {Math.round((score / (questions?.length || 1)) * 100)}% accuracy).
          </p>

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={handleResetQuiz}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retake Same Quiz</span>
            </button>
            <button
              onClick={handleGenerateQuiz}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate New Quiz</span>
            </button>
          </div>
        </div>
      )}

      {!questions && !isGenerating && (
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <Award className="h-8 w-8 mx-auto text-indigo-400 mb-2 opacity-60" />
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Generate an interactive quiz
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Uses progressive micro-tasking to craft guaranteed 4-option questions with accurate explanations from your notes.
          </p>
        </div>
      )}
    </div>
  );
};
