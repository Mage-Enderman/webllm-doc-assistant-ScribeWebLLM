import { ChunkItem, CitationItem, KeyConcept, QuizQuestion, SearchResult, SectionSummary } from '../types';

export interface ContextBudgetConfig {
  maxContextTokens: number;
  maxGenerationTokens: number;
  systemPromptTokens: number;
  historyTokensMax: number;
}

export const DEFAULT_SMALL_MODEL_BUDGET: ContextBudgetConfig = {
  maxContextTokens: 2400,
  maxGenerationTokens: 750,
  systemPromptTokens: 150,
  historyTokensMax: 350,
};

/**
 * Clean and compact text specifically for small models:
 * Strips repeated whitespace, page headers, URLs, and low-information formatting noise.
 */
export function cleanTextForSmallModel(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // Remove repeated page markers like "--- [Page 1] ---"
    .replace(/---+\s*\[Page\s*\d+\]\s*---+/gi, '')
    // Remove standalone numbers or isolated punctuation lines
    .replace(/^\s*[\d\W]\s*$/gm, '')
    // Collapse multiple spaces and multiple newlines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

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
      if (similarity > 0.65) {
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
    const cleanedText = cleanTextForSmallModel(chunk.text);
    const chunkTokens = Math.ceil(cleanedText.length / 4);

    if (currentTokens + chunkTokens > allowedChunkTokens && contextParts.length > 0) {
      return;
    }

    const citationNumber = index + 1;
    const pageStr = chunk.metadata.page ? ` (Page ${chunk.metadata.page})` : '';
    const chunkHeader = `[Source ${citationNumber}: ${chunk.docTitle}${pageStr}]`;
    const snippet = `${chunkHeader}\n${cleanedText}\n`;

    contextParts.push(snippet);
    currentTokens += chunkTokens + 15;

    citations.push({
      docId: chunk.docId,
      chunkId: chunk.id,
      docTitle: chunk.docTitle,
      page: chunk.metadata.page,
      textSnippet: cleanedText.slice(0, 180) + '...',
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
  const cleanedTexts = chunkTexts.map(cleanTextForSmallModel);

  const system = `You are a technical documentation summarizer.
Summarize the following text excerpts into 3 concise, high-value bullet points. Focus on main concepts, definitions, and conclusions. Avoid boilerplate.`;

  const user = `Text excerpts to summarize:
${cleanedTexts.join('\n\n')}

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
  const cleanedContext = cleanTextForSmallModel(contextText);

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
${cleanedContext}

Structured Study Notes:`;

  return { system, user };
}

/**
 * Small Model Harness: Micro-task prompt to generate ONE clean multiple-choice question
 * with exactly 4 distinct options from a single focused concept snippet.
 */
export function buildSingleQuestionPrompt(snippet: string): { system: string; user: string } {
  const cleanedSnippet = cleanTextForSmallModel(snippet).slice(0, 700);

  const system = `You are a test maker. Create ONE multiple-choice question based on the text.
RULES:
1. Output JSON ONLY.
2. Provide EXACTLY 4 distinct choices in "options" (A, B, C, D).
3. All 4 choices MUST be different. Do not repeat choices.
4. "correctIndex" must be 0, 1, 2, or 3.
5. "explanation" must state why the correct choice is right without referencing phantom options.

JSON FORMAT:
{
  "question": "What is...",
  "options": [
    "Correct statement or fact",
    "Plausible alternative statement",
    "Incorrect statement",
    "Another distinct alternative"
  ],
  "correctIndex": 0,
  "explanation": "The text confirms this because..."
}`;

  const user = `Source text:
${cleanedSnippet}

Output ONE question in JSON:`;

  return { system, user };
}

/**
 * Sanitizes JSON strings to fix common model output issues.
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
 * Parses and verifies a single question from model output, ensuring exactly 4 distinct options.
 */
export function parseSingleQuizQuestion(rawJson: string): QuizQuestion | null {
  const sanitized = sanitizeJsonString(rawJson);

  let parsed: any = null;
  try {
    parsed = JSON.parse(sanitized);
  } catch {
    // Try regex extraction of { ... }
    const match = sanitized.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(sanitizeJsonString(match[0]));
      } catch {
        return null;
      }
    }
  }

  if (!parsed || typeof parsed.question !== 'string' || !Array.isArray(parsed.options)) {
    return null;
  }

  // Deduplicate and trim options
  const uniqueOptions: string[] = [];
  for (const opt of parsed.options) {
    const trimmed = String(opt).trim();
    if (!trimmed) continue;

    // Check similarity to already added options
    const isDuplicate = uniqueOptions.some((existing) => {
      if (existing.toLowerCase() === trimmed.toLowerCase()) return true;
      if (existing.length > 10 && trimmed.length > 10) {
        if (existing.includes(trimmed) || trimmed.includes(existing)) return true;
      }
      return false;
    });

    if (!isDuplicate) {
      uniqueOptions.push(trimmed);
    }
  }

  // If the model gave less than 4 unique options, pad with plausible contrasting alternatives
  const fallbackDistractors = [
    'It operates as a secondary backup cache only during system restarts.',
    'It is restricted strictly to kernel processes and unavailable to user applications.',
    'It is allocated dynamically without requiring physical drive storage.',
    'It replaces standard RAM allocations completely.',
  ];

  while (uniqueOptions.length < 4) {
    const candidate = fallbackDistractors.shift() || `Alternative condition ${uniqueOptions.length + 1}`;
    if (!uniqueOptions.includes(candidate)) {
      uniqueOptions.push(candidate);
    }
  }

  // Resolve correctIndex
  let correctIndex = 0;
  if (typeof parsed.correctIndex === 'number' && parsed.correctIndex >= 0 && parsed.correctIndex < 4) {
    correctIndex = parsed.correctIndex;
  } else if (typeof parsed.correctIndex === 'string' && !isNaN(Number(parsed.correctIndex))) {
    correctIndex = Math.min(3, Math.max(0, Number(parsed.correctIndex)));
  } else {
    const answerVal = String(parsed.correct_answer || parsed.correctAnswer || parsed.answer || '').trim();
    if (answerVal) {
      if (/^[A-Da-d]$/.test(answerVal)) {
        correctIndex = answerVal.toUpperCase().charCodeAt(0) - 65;
      } else {
        const found = uniqueOptions.findIndex(
          (o) => o.toLowerCase() === answerVal.toLowerCase() || o.toLowerCase().includes(answerVal.toLowerCase())
        );
        if (found !== -1) correctIndex = found;
      }
    }
  }

  // Clean explanation: avoid references to non-existent options
  let explanation = String(parsed.explanation || '').trim();
  if (!explanation || explanation.toLowerCase().includes('option 3 is incorrect') && uniqueOptions.length < 3) {
    explanation = `The correct answer is "${uniqueOptions[correctIndex]}", as supported by the documentation.`;
  } else {
    // If explanation has weird references like "Option 3 is incorrect" when Option 3 was the right one or phantom, fix phrasing
    explanation = explanation.replace(/the third option/gi, 'an incorrect alternative');
  }

  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    question: parsed.question.trim(),
    options: uniqueOptions.slice(0, 4),
    correctIndex,
    explanation,
  };
}

/**
 * Generic batch quiz question parser
 */
export function parseQuizQuestions(rawText: string): QuizQuestion[] {
  const sanitized = sanitizeJsonString(rawText);

  try {
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed)) {
      const results: QuizQuestion[] = [];
      for (const item of parsed) {
        const q = parseSingleQuizQuestion(JSON.stringify(item));
        if (q) results.push(q);
      }
      return results;
    }
  } catch {
    // Try extracting individual JSON objects
    const results: QuizQuestion[] = [];
    const objectMatches = sanitized.match(/\{[\s\S]*?"question"[\s\S]*?\}/g) || [];
    for (const objStr of objectMatches) {
      const q = parseSingleQuizQuestion(objStr);
      if (q) results.push(q);
    }
    return results;
  }

  return [];
}
