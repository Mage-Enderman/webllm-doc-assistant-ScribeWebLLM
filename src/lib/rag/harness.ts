import { ChunkItem, CitationItem, KeyConcept, QuizQuestion, SearchResult, SectionSummary } from '../types';

export interface ContextBudgetConfig {
  maxContextTokens: number; // e.g. 2500 for small models
  maxGenerationTokens: number; // e.g. 800
  systemPromptTokens: number; // ~150
  historyTokensMax: number; // ~350
}

export const DEFAULT_SMALL_MODEL_BUDGET: ContextBudgetConfig = {
  maxContextTokens: 2400,
  maxGenerationTokens: 750,
  systemPromptTokens: 150,
  historyTokensMax: 350,
};

/**
 * Prune overlapping or redundant chunks to maximize context diversity.
 */
export function deduplicateChunks(searchResults: SearchResult[]): SearchResult[] {
  const result: SearchResult[] = [];

  for (const item of searchResults) {
    const wordsA = new Set(item.chunk.text.toLowerCase().split(/\s+/));
    let isRedundant = false;

    for (const kept of result) {
      const wordsB = new Set(kept.chunk.text.toLowerCase().split(/\s+/));
      let intersection = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) intersection++;
      }
      const similarity = intersection / Math.min(wordsA.size, wordsB.size);
      if (similarity > 0.75) {
        isRedundant = true;
        break;
      }
    }

    if (!isRedundant) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Assembles a context string that strictly fits within the small model token budget.
 */
export function assembleContextForPrompt(
  searchResults: SearchResult[],
  budget: ContextBudgetConfig = DEFAULT_SMALL_MODEL_BUDGET
): { contextText: string; citations: CitationItem[]; usedTokens: number } {
  const allowedChunkTokens = budget.maxContextTokens - (budget.systemPromptTokens + budget.historyTokensMax);
  const deduplicated = deduplicateChunks(searchResults);

  let currentTokens = 0;
  const contextParts: string[] = [];
  const citations: CitationItem[] = [];

  deduplicated.forEach((res, index) => {
    const chunk = res.chunk;
    const chunkTokens = chunk.tokenEstimate || Math.ceil(chunk.text.length / 4);

    if (currentTokens + chunkTokens > allowedChunkTokens && contextParts.length > 0) {
      return; // Stop adding if we exceed budget
    }

    const citationNumber = index + 1;
    const pageStr = chunk.metadata.page ? ` (Page ${chunk.metadata.page})` : '';
    const chunkHeader = `[Source ${citationNumber}: ${chunk.docTitle}${pageStr}]`;
    const snippet = `${chunkHeader}\n${chunk.text}\n`;

    contextParts.push(snippet);
    currentTokens += chunkTokens + 15;

    citations.push({
      docId: chunk.docId,
      chunkId: chunk.id,
      docTitle: chunk.docTitle,
      page: chunk.metadata.page,
      textSnippet: chunk.text.slice(0, 180) + '...',
      score: res.score,
    });
  });

  return {
    contextText: contextParts.join('\n---\n\n'),
    citations,
    usedTokens: currentTokens,
  };
}

/**
 * Creates an anti-hallucination, delimited prompt optimized specifically for small models.
 */
export function buildGroundedChatPrompt(
  contextText: string,
  userQuestion: string,
  historySummary?: string
): { system: string; user: string } {
  const system = `You are an accurate, helpful AI learning assistant running locally in the user's browser.
RULES:
1. Answer the question based ONLY on the provided [Documentation Context] below.
2. If the context does NOT contain enough information, state clearly: "The provided documentation does not contain sufficient details to answer this question." Do not fabricate answers.
3. Keep your explanation structured, clear, and direct.
4. Reference your sources using [Source 1], [Source 2], etc. when citing facts.`;

  let user = '';
  if (historySummary) {
    user += `Previous conversation context:\n${historySummary}\n\n`;
  }

  user += `[Documentation Context]
${contextText || 'No relevant documentation found.'}
[/Documentation Context]

Question: ${userQuestion}

Helpful grounded answer with citations:`;

  return { system, user };
}

/**
 * Creates prompt for Map step of hierarchical summarization
 */
export function buildChunkBatchSummaryPrompt(chunkTexts: string[]): { system: string; user: string } {
  const system = `You are a technical documentation summarizer.
Summarize the following text excerpts into 3 to 4 concise, high-value key bullet points. Focus on main concepts, definitions, and conclusions. Do not add fluff.`;

  const user = `Text excerpts to summarize:
${chunkTexts.join('\n\n')}

Key bullet points:`;

  return { system, user };
}

/**
 * Creates prompt for Reduce step of hierarchical summarization
 */
export function buildFinalSummaryPrompt(intermediatePoints: string[], docTitle: string): { system: string; user: string } {
  const system = `You are a synthesis specialist. Transform the following collected key points from the document "${docTitle}" into a clean, comprehensive structured summary.
Output sections:
1. **TL;DR**: A 2-sentence quick summary.
2. **Executive Summary**: A cohesive 2-paragraph overview.
3. **Core Highlights**: Bulleted list of the most critical takeaways.`;

  const user = `Collected document key points:
${intermediatePoints.join('\n')}

Synthesized structured summary:`;

  return { system, user };
}

/**
 * Creates prompt for generating Smart Study Notes
 */
export function buildSmartNotesPrompt(contextText: string, docTitle: string): { system: string; user: string } {
  const system = `You are an expert study guide creator. Convert the documentation into organized study notes.
Format your response exactly as follows:
### Core Concepts
- **[Concept/Term]**: [Definition and significance]
- **[Concept/Term]**: [Definition and significance]

### Essential Takeaways
- [Actionable takeaway 1]
- [Actionable takeaway 2]
- [Actionable takeaway 3]

### Review Questions
- [Question 1 for testing comprehension]
- [Question 2 for testing comprehension]`;

  const user = `Document: "${docTitle}"
Context:
${contextText}

Structured Study Notes:`;

  return { system, user };
}

/**
 * Creates prompt for automated quiz generation with robust JSON output
 */
export function buildQuizGenerationPrompt(contextText: string, questionCount: number = 5): { system: string; user: string } {
  const system = `You are a professional quiz maker. Generate a ${questionCount}-question multiple-choice quiz based ONLY on the provided text.
CRITICAL FORMAT RULES:
1. Output valid JSON array ONLY. No markdown code blocks, no conversational preamble.
2. Every item MUST have:
   - "question": string
   - "options": array of 4 unique strings
   - "correctIndex": integer (0, 1, 2, or 3) indicating which option is correct
   - "explanation": string explaining why the answer is correct
3. Do not use invalid backslash escapes in strings. Escape Windows paths with double backslashes.

Example output format:
[
  {
    "question": "What is the primary function of...?",
    "options": ["First choice", "Second choice", "Third choice", "Fourth choice"],
    "correctIndex": 1,
    "explanation": "Option 2 is correct because the text states..."
  }
]`;

  const user = `Source Context:
${contextText}

Generate exactly ${questionCount} multiple choice questions in valid JSON:`;

  return { system, user };
}

/**
 * Sanitizes JSON strings to fix common model output issues like:
 * - Unescaped backslashes (e.g., "Memory\Available" -> "Memory\\Available")
 * - Trailing commas
 * - Markdown code block markers
 */
export function sanitizeJsonString(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown code fences (e.g. ```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Fix unescaped backslashes that are not followed by valid JSON escape sequences: ", \, /, b, f, n, r, t, uXXXX
  cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');

  // Remove trailing commas before closing braces or brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned;
}

/**
 * Bulletproof quiz parser that extracts complete questions even from partially truncated model outputs
 */
export function parseQuizQuestions(rawText: string): QuizQuestion[] {
  const sanitized = sanitizeJsonString(rawText);

  // 1. Try parsing full JSON array directly
  try {
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return normalizeQuizItems(parsed);
    }
  } catch {
    // Continue to regex recovery
  }

  // 2. Try regex extraction of the array block [ ... ]
  const arrayMatch = sanitized.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(sanitizeJsonString(arrayMatch[0]));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeQuizItems(parsed);
      }
    } catch {
      // Continue to progressive item recovery
    }
  }

  // 3. Progressive recovery: Extract every completed individual question object { "question": ... }
  const recoveredItems: any[] = [];
  const objectRegex = /\{[\s\S]*?"question"\s*:\s*"([^"]+)"[\s\S]*?"options"\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/g;
  let match;

  while ((match = objectRegex.exec(sanitized)) !== null) {
    try {
      const objStr = sanitizeJsonString(match[0]);
      const obj = JSON.parse(objStr);
      if (obj && obj.question && Array.isArray(obj.options)) {
        recoveredItems.push(obj);
      }
    } catch {
      // If full object parse fails, try extracting fields manually
      try {
        const qText = match[1];
        const rawOptions = match[2];
        const optMatches = Array.from(rawOptions.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map((m) => m[1]);

        if (qText && optMatches.length >= 2) {
          // Check for correctIndex or correct_answer
          let correctIndex = 0;
          const idxMatch = match[0].match(/"correctIndex"\s*:\s*(\d+)/);
          const ansMatch = match[0].match(/"correct_answer"\s*:\s*"([^"]+)"/);

          if (idxMatch) {
            correctIndex = parseInt(idxMatch[1], 10);
          } else if (ansMatch) {
            const ansText = ansMatch[1].trim().toLowerCase();
            const foundIdx = optMatches.findIndex((o) => o.trim().toLowerCase() === ansText);
            if (foundIdx !== -1) correctIndex = foundIdx;
          }

          recoveredItems.push({
            question: qText,
            options: optMatches,
            correctIndex,
            explanation: 'Based on the source documentation.',
          });
        }
      } catch {
        // Ignore unparseable snippet
      }
    }
  }

  if (recoveredItems.length > 0) {
    return normalizeQuizItems(recoveredItems);
  }

  return [];
}

/**
 * Normalizes question items from varied model formats:
 * - Maps `correct_answer` or letter answers (A/B/C/D) to `correctIndex`
 * - Ensures 4 options exist
 * - Ensures explanation exists
 */
function normalizeQuizItems(rawItems: any[]): QuizQuestion[] {
  return rawItems
    .filter((item) => item && typeof item.question === 'string' && Array.isArray(item.options))
    .map((item, idx) => {
      const options: string[] = item.options.map((o: any) => String(o).trim());

      let correctIndex = 0;
      if (typeof item.correctIndex === 'number' && item.correctIndex >= 0 && item.correctIndex < options.length) {
        correctIndex = item.correctIndex;
      } else if (typeof item.correctIndex === 'string' && !isNaN(Number(item.correctIndex))) {
        correctIndex = Number(item.correctIndex);
      } else {
        // Handle models outputting "correct_answer", "correctAnswer", or "answer"
        const answerVal = String(item.correct_answer || item.correctAnswer || item.answer || '').trim();
        if (answerVal) {
          // Case 1: Letter answer "A", "B", "C", "D"
          if (/^[A-Da-d]$/.test(answerVal)) {
            correctIndex = answerVal.toUpperCase().charCodeAt(0) - 65;
          } else {
            // Case 2: Matching text
            const foundIndex = options.findIndex(
              (opt) => opt.toLowerCase() === answerVal.toLowerCase() || opt.toLowerCase().includes(answerVal.toLowerCase())
            );
            if (foundIndex !== -1) {
              correctIndex = foundIndex;
            }
          }
        }
      }

      // Safe clamp
      if (correctIndex < 0 || correctIndex >= options.length) {
        correctIndex = 0;
      }

      return {
        id: `q_${Date.now()}_${idx}`,
        question: item.question.trim(),
        options: options.length >= 2 ? options : [...options, 'Option B', 'Option C', 'Option D'].slice(0, 4),
        correctIndex,
        explanation: item.explanation || 'Refer to the source documentation for full context.',
      };
    });
}

/**
 * Generic JSON extractor for backward compatibility
 */
export function extractJsonFromModelOutput<T>(rawText: string, fallback: T): T {
  try {
    const sanitized = sanitizeJsonString(rawText);
    return JSON.parse(sanitized);
  } catch {
    const match = rawText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) {
      try {
        return JSON.parse(sanitizeJsonString(match[1]));
      } catch (err) {
        console.warn('Failed to parse extracted JSON match:', err);
      }
    }
  }
  return fallback;
}
