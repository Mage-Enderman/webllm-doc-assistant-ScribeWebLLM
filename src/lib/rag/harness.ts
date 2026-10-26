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
  const system = `You are an academic test maker. Create a ${questionCount}-question multiple-choice quiz based ONLY on the provided text.
Every question must have 4 options (A, B, C, D) and exactly 1 correct answer.
You MUST output valid JSON only, without markdown backticks or commentary.

JSON format:
[
  {
    "question": "What is...",
    "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correctIndex": 0,
    "explanation": "Explanation why this is correct based on the text."
  }
]`;

  const user = `Source Text:
${contextText}

Create ${questionCount} multiple choice questions in valid JSON:`;

  return { system, user };
}

/**
 * Robust JSON extraction helper that handles markdown code blocks or trailing commas from small models.
 */
export function extractJsonFromModelOutput<T>(rawText: string, fallback: T): T {
  try {
    // 1. Try direct parse
    return JSON.parse(rawText.trim());
  } catch {
    // 2. Try regex extraction of JSON block [ ... ] or { ... }
    const match = rawText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) {
      try {
        const cleaned = match[1]
          .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
          .trim();
        return JSON.parse(cleaned);
      } catch (err) {
        console.warn('Failed to parse extracted JSON match:', err, match[1]);
      }
    }
  }
  return fallback;
}
