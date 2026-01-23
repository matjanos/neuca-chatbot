import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { MODEL_CONFIG } from '../config.js';
import type { Source, SearchResult } from '../types.js';
import { generateQueryEmbedding } from '../services/embedding.js';
import { searchSimilar, listLectures } from '../services/qdrant.js';
import * as memory from '../services/memory.js';

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
  }));
}

/** Build system prompt */
function buildSystemPrompt(lectureTitle?: string, hasContext?: boolean): string {
  const basePrompt = lectureTitle
    ? `You are a helpful assistant answering questions about the lecture: "${lectureTitle}".`
    : 'You are a helpful assistant answering questions about lecture transcripts.';

  if (hasContext) {
    return `${basePrompt}

You have access to the full lecture transcript through semantic search. The excerpts provided below are actual quotes from this lecture, retrieved based on the user's question.

Guidelines:
- Be concise and direct. Give short, focused answers unless the user asks for detail or elaboration.
- Answer based on the transcript excerpts provided. These are real quotes from the lecture.
- Reference speakers by name and approximate timestamps when relevant.
- If the excerpts don't fully answer the question, provide what you can from the available context.
- Never say you don't have the transcript - you DO have access to it via search.`;
  }

  return `${basePrompt}

You have access to this lecture's transcript through semantic search, but no relevant excerpts were found for this particular question.

Be concise. Ask the user to be more specific, or suggest a few concrete topics/speakers they could ask about.`;
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
      const response = "I don't have any lecture transcripts available. Please add some transcripts first using the CLI tool.";
      memory.addMessage(conversationId, { role: 'assistant', content: response });
      return { type: 'early', result: { response } };
    }

    if (availableLectures.length === 1) {
      effectiveTitle = availableLectures[0];
      memory.setLectureTitle(conversationId, effectiveTitle);
    } else {
      memory.addMessage(conversationId, { role: 'user', content: userMessage });
      const lectureList = availableLectures.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const response = `I have ${availableLectures.length} lecture transcripts available. Which one would you like to discuss?\n\n${lectureList}\n\nPlease specify the lecture by number or name.`;
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
    const response = `Great! I'll help you with questions about "${effectiveTitle}". What would you like to know?`;
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
  });
  const context = buildContext(searchResults);

  // Build messages for the LLM
  const systemPrompt = buildSystemPrompt(effectiveTitle, context.length > 0);
  const history = memory.getHistory(conversationId);

  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (context) {
    messages.push({
      role: 'system',
      content: `Relevant transcript excerpts:\n\n${context}`,
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
