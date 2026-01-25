import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { MODEL_CONFIG } from '../config.js';
import type { Source, SearchResult } from '../types.js';
import { generateQueryEmbedding } from '../services/embedding.js';
import { searchSimilar, listLectures } from '../services/qdrant.js';
import * as memory from '../services/memory.js';

const tracer = trace.getTracer('lecture-qa');

/** Build context string from search results */
function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const chunks = results.map((r, i) => {
    const { payload } = r;
    const timeRange = `[${formatTime(payload.startSec)} - ${formatTime(payload.endSec)}]`;
    return `[${i + 1}] ${payload.speaker} ${timeRange}:\n${payload.text}`;
  });

  return chunks.join('\n\n');
}

/** Format seconds to MM:SS */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Extract sources from search results */
function extractSources(results: SearchResult[]): Source[] {
  return results.map((r) => ({
    text: r.payload.text,
    speaker: r.payload.speaker,
    startSec: r.payload.startSec,
    endSec: r.payload.endSec,
    sourceUrl: r.payload.sourceUrl,
    docId: r.payload.docId,
  }));
}

/** Build system prompt */
async function buildSystemPrompt(
  lectureTitle?: string,
  hasContext?: boolean,
  availableLectures?: string[]
): Promise<string> {
  // Load Neucacz personality from file
  const neukaczPrompt = await Bun.file(import.meta.dir + '/Neucacz.MD').text();

  const basePrompt = lectureTitle
    ? `${neukaczPrompt}\n\nTeraz odpowiadasz na pytania dotyczące wykładu: "${lectureTitle}".`
    : `${neukaczPrompt}\n\nTeraz odpowiadasz na pytania dotyczące transkrypcji wykładów.`;

  const lectureListInfo = availableLectures && availableLectures.length > 0
    ? `\n\nDostępne wykłady w systemie:\n${availableLectures.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  if (hasContext) {
    return `${basePrompt}${lectureListInfo}

Masz dostęp do pełnej transkrypcji wykładu poprzez wyszukiwanie semantyczne. Poniższe fragmenty to rzeczywiste cytaty z tego wykładu, pobrane na podstawie pytania użytkownika.

Wytyczne:
- Bądź zwięzły i konkretny. Udzielaj krótkich, skupionych odpowiedzi, chyba że użytkownik prosi o szczegóły lub rozwinięcie.
- Odpowiadaj na podstawie dostarczonych fragmentów transkrypcji. To są prawdziwe cytaty z wykładu.
- Odwołuj się do mówców po imieniu i przybliżonych znacznikach czasowych, gdy jest to istotne.
- Jeśli fragmenty nie odpowiadają w pełni na pytanie, podaj to, co możesz na podstawie dostępnego kontekstu.
- Nigdy nie mów, że nie masz transkrypcji - MASZ do niej dostęp poprzez wyszukiwanie.
- Jeśli użytkownik pyta o dostępne wykłady, powiedz mu, co jest w systemie.`;
  }

  return `${basePrompt}${lectureListInfo}

Masz dostęp do transkrypcji tego wykładu poprzez wyszukiwanie semantyczne, ale nie znaleziono odpowiednich fragmentów dla tego konkretnego pytania.

Bądź zwięzły. Poproś użytkownika, aby był bardziej konkretny, lub zasugeruj kilka konkretnych tematów/mówców, o których może zapytać. Jeśli użytkownik pyta o dostępne wykłady, powiedz mu, co jest w systemie.`;
}

export interface ProcessMessageResult {
  response: string;
  sources?: Source[];
  requiresLectureSelection?: boolean;
  availableLectures?: string[];
  selectedLecture?: string;
}

/** Early return result for lecture selection or other non-LLM responses */
interface EarlyReturn {
  type: 'early';
  result: ProcessMessageResult;
}

/** Context prepared for LLM generation */
interface PreparedContext {
  type: 'ready';
  messages: ModelMessage[];
  sources?: Source[];
  selectedLecture?: string;
  conversationId: string;
}

type PrepareResult = EarlyReturn | PreparedContext;

/** Prepare context for message processing (lecture selection, RAG search) */
async function prepareContext(
  conversationId: string,
  userMessage: string,
  lectureTitle?: string
): Promise<PrepareResult> {
  // Get or create conversation
  memory.getOrCreate(conversationId);

  // Update lecture title if provided
  if (lectureTitle) {
    memory.setLectureTitle(conversationId, lectureTitle);
  }

  // Get effective lecture title
  let effectiveTitle = lectureTitle || memory.getLectureTitle(conversationId);

  // If no lecture is selected, check available lectures
  if (!effectiveTitle) {
    const availableLectures = await listLectures();

    if (availableLectures.length === 0) {
      memory.addMessage(conversationId, { role: 'user', content: userMessage });
      const response = "Nie mam dostępnych żadnych transkrypcji wykładów. Najpierw dodaj transkrypcje za pomocą narzędzia CLI.";
      memory.addMessage(conversationId, { role: 'assistant', content: response });
      return { type: 'early', result: { response } };
    }

    if (availableLectures.length === 1) {
      effectiveTitle = availableLectures[0];
      memory.setLectureTitle(conversationId, effectiveTitle);
    } else {
      memory.addMessage(conversationId, { role: 'user', content: userMessage });
      const lectureList = availableLectures.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const response = `Mam ${availableLectures.length} transkrypcji wykładów dostępnych. Który wykład chcesz omówić?\n\n${lectureList}\n\nProszę określić wykład numer lub nazwę.`;
      memory.addMessage(conversationId, { role: 'assistant', content: response });
      return {
        type: 'early',
        result: {
          response,
          requiresLectureSelection: true,
          availableLectures,
        },
      };
    }
  }

  // Add user message to history
  memory.addMessage(conversationId, { role: 'user', content: userMessage });

  // Check if user is selecting a lecture from the list
  const availableLectures = await listLectures();
  const selectedLecture = matchLectureSelection(userMessage, availableLectures);
  if (selectedLecture && selectedLecture !== effectiveTitle) {
    effectiveTitle = selectedLecture;
    memory.setLectureTitle(conversationId, effectiveTitle);
    const response = `Świetnie! Pomogę Ci z pytaniami dotyczącymi "${effectiveTitle}". Co chciałbyś wiedzieć?`;
    memory.addMessage(conversationId, { role: 'assistant', content: response });
    return {
      type: 'early',
      result: { response, selectedLecture: effectiveTitle },
    };
  }

  // Generate embedding for the query and search
  const queryVector = await generateQueryEmbedding(userMessage);
  const searchResults = await searchSimilar(queryVector, {
    title: effectiveTitle,
    query: userMessage,
  });
  const context = buildContext(searchResults);

  // Build messages for the LLM (include all available lectures in system prompt)
  const allLectures = await listLectures();
  const systemPrompt = await buildSystemPrompt(effectiveTitle, context.length > 0, allLectures);
  const history = memory.getHistory(conversationId);

  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (context) {
    messages.push({
      role: 'system',
      content: `Odpowiednie fragmenty transkrypcji:\n\n${context}`,
    });
  }

  // Add conversation history (excluding the last user message)
  const historyWithoutLast = history.slice(0, -1);
  messages.push(...historyWithoutLast);
  messages.push({ role: 'user', content: userMessage });

  const sources = searchResults.length > 0 ? extractSources(searchResults) : undefined;

  return {
    type: 'ready',
    messages,
    sources,
    selectedLecture: effectiveTitle,
    conversationId,
  };
}

/** Process a user message and generate a response (non-streaming) */
export async function processMessage(
  conversationId: string,
  userMessage: string,
  lectureTitle?: string
): Promise<ProcessMessageResult> {
  const prepared = await prepareContext(conversationId, userMessage, lectureTitle);

  if (prepared.type === 'early') {
    return prepared.result;
  }

  const { text } = await generateText({
    model: openai(MODEL_CONFIG.model),
    providerOptions: {
      openai: {
        reasoningEffort: MODEL_CONFIG.reasoningEffort,
      },
    },
    messages: prepared.messages,
    experimental_telemetry: { isEnabled: true },
  });

  memory.addMessage(prepared.conversationId, { role: 'assistant', content: text });

  return {
    response: text,
    sources: prepared.sources,
    selectedLecture: prepared.selectedLecture,
  };
}

/** Streaming response metadata */
export interface StreamMetadata {
  conversationId: string;
  sources?: Source[];
  selectedLecture?: string;
}

/** Process a user message with streaming response */
export async function processMessageStream(
  conversationId: string,
  userMessage: string,
  lectureTitle?: string
): Promise<
  | { type: 'early'; result: ProcessMessageResult }
  | { type: 'stream'; stream: ReturnType<typeof streamText>; metadata: StreamMetadata }
> {
  const prepared = await prepareContext(conversationId, userMessage, lectureTitle);

  if (prepared.type === 'early') {
    return { type: 'early', result: prepared.result };
  }

  const stream = streamText({
    model: openai(MODEL_CONFIG.model),
    providerOptions: {
      openai: {
        reasoningEffort: MODEL_CONFIG.reasoningEffort,
      },
    },
    messages: prepared.messages,
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ text }) => {
      memory.addMessage(prepared.conversationId, { role: 'assistant', content: text });
    },
  });

  return {
    type: 'stream',
    stream,
    metadata: {
      conversationId: prepared.conversationId,
      sources: prepared.sources,
      selectedLecture: prepared.selectedLecture,
    },
  };
}

/** RAG context for AI SDK compatible endpoint */
export interface RAGContext {
  systemPrompt: string;
  contextPrompt?: string;
  sources?: Source[];
  selectedLecture?: string;
  videoId?: string;
}

/**
 * Prepare RAG context for use with AI SDK's useChat pattern.
 * This is a stateless version that doesn't use conversation memory.
 */
export async function prepareRAGContext(
  userMessage: string,
  lectureTitle?: string
): Promise<RAGContext> {
  return tracer.startActiveSpan('rag.prepare', async (span) => {
    try {
      // Input: query and filter parameters
      const inputData = {
        query: userMessage,
        lecture_filter: lectureTitle || null,
      };
      span.setAttribute('input.value', JSON.stringify(inputData));

      // Determine effective lecture title
      let effectiveTitle = lectureTitle;

      if (!effectiveTitle) {
        const availableLectures = await listLectures();
        if (availableLectures.length === 1) {
          effectiveTitle = availableLectures[0];
        }
        // If multiple lectures and none specified, we proceed without filtering
      }

      // Get all available lectures for the system prompt
      const allLectures = await listLectures();

      // Generate embedding and search
      const queryVector = await generateQueryEmbedding(userMessage);
      const searchResults = await searchSimilar(queryVector, {
        title: effectiveTitle,
        query: userMessage,
      });
      const context = buildContext(searchResults);

      // Build system prompt (include lecture list so model can answer meta-questions)
      const systemPrompt = await buildSystemPrompt(effectiveTitle, context.length > 0, allLectures);

      // Build context prompt if we have results
      const contextPrompt = context
        ? `Odpowiednie fragmenty transkrypcji:\n\n${context}`
        : undefined;

      const sources = searchResults.length > 0 ? extractSources(searchResults) : undefined;

      // Extract video ID from sources (use first source's docId)
      const videoId = sources?.[0]?.docId;

      // Output: RAG context summary
      const outputData = {
        selected_lecture: effectiveTitle || null,
        sources_count: sources?.length ?? 0,
        has_context: context.length > 0,
        context_length: context.length,
        sources_summary: sources?.map(s => ({
          speaker: s.speaker,
          time_range: `${s.startSec}-${s.endSec}s`,
        })) || [],
      };
      span.setAttribute('output.value', JSON.stringify(outputData));
      span.setStatus({ code: SpanStatusCode.OK });

      return {
        systemPrompt,
        contextPrompt,
        sources,
        selectedLecture: effectiveTitle,
        videoId,
      };
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Try to match user input to a lecture title */
function matchLectureSelection(input: string, lectures: string[]): string | null {
  const trimmed = input.trim();

  const numMatch = trimmed.match(/^(\d+)\.?$/);
  if (numMatch) {
    const index = parseInt(numMatch[1], 10) - 1;
    if (index >= 0 && index < lectures.length) {
      return lectures[index];
    }
  }

  const lowerInput = trimmed.toLowerCase();
  for (const lecture of lectures) {
    if (lecture.toLowerCase() === lowerInput) {
      return lecture;
    }
  }

  for (const lecture of lectures) {
    const lowerLecture = lecture.toLowerCase();
    if (lowerLecture.includes(lowerInput) || lowerInput.includes(lowerLecture)) {
      return lecture;
    }
  }

  return null;
}
