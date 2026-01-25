import { QdrantClient } from '@qdrant/js-client-rest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { ChunkPayload, SearchResult } from '../types.js';
import { RAG_CONFIG } from '../config.js';

const tracer = trace.getTracer('qdrant');

const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'transcripts';

let client: QdrantClient | null = null;

/** Get or create Qdrant client (singleton) */
export function getQdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;

    client = new QdrantClient({
      url,
      apiKey: apiKey || undefined,
    });
  }
  return client;
}

/** Check if Qdrant is reachable */
export async function checkConnection(): Promise<boolean> {
  try {
    await getQdrantClient().getCollections();
    return true;
  } catch {
    return false;
  }
}

/** Search for similar chunks by vector */
export async function searchSimilar(
  queryVector: number[],
  options: {
    title?: string;
    limit?: number;
    query?: string; // Original query text for tracing
  } = {}
): Promise<SearchResult[]> {
  const { title, limit = RAG_CONFIG.topK, query } = options;
  const startTime = Date.now();
  console.log(`[qdrant] Searching for "${query?.slice(0, 50) ?? 'no query'}...", title filter: ${title ?? 'none'}, limit: ${limit}`);

  return tracer.startActiveSpan('qdrant.search', async (span) => {
    try {
      // Input: structured search parameters
      const inputData = {
        query: query || null,
        collection: COLLECTION_NAME,
        limit,
        filter: title ? { title } : null,
        vector_dimensions: queryVector.length,
      };
      span.setAttribute('input.value', JSON.stringify(inputData));

      const filter: { must: Array<{ key: string; match: { value: string } }> } = { must: [] };

      if (title) {
        filter.must.push({
          key: 'title',
          match: { value: title },
        });
      }

      const results = await getQdrantClient().search(COLLECTION_NAME, {
        vector: queryVector,
        filter: filter.must.length > 0 ? filter : undefined,
        limit,
        with_payload: true,
      });

      console.log(`[qdrant] Found ${results.length} results in ${Date.now() - startTime}ms`);
      if (results.length > 0) {
        console.log(`[qdrant] Top result score: ${results[0].score.toFixed(4)}`);
      }

      // Output: search results with scores and content preview
      const outputData = {
        results_count: results.length,
        results: results.map((r, i) => {
          const payload = r.payload as unknown as ChunkPayload;
          return {
            rank: i + 1,
            score: r.score,
            speaker: payload.speaker,
            time_range: `${payload.startSec}-${payload.endSec}s`,
            text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : ''),
          };
        }),
      };
      span.setAttribute('output.value', JSON.stringify(outputData));
      span.setStatus({ code: SpanStatusCode.OK });

      return results.map((r) => ({
        payload: r.payload as unknown as ChunkPayload,
        score: r.score,
      }));
    } catch (error) {
      console.error(`[qdrant] Search error:`, error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Get collection statistics */
export async function getCollectionStats(): Promise<{
  exists: boolean;
  pointCount: number;
}> {
  try {
    const info = await getQdrantClient().getCollection(COLLECTION_NAME);
    return {
      exists: true,
      pointCount: info.points_count || 0,
    };
  } catch {
    return {
      exists: false,
      pointCount: 0,
    };
  }
}

/** List all available lectures (unique titles) */
export async function listLectures(): Promise<string[]> {
  try {
    const titles = new Set<string>();
    let offset: string | number | undefined = undefined;
    const limit = 100;

    while (true) {
      const result = await getQdrantClient().scroll(COLLECTION_NAME, {
        limit,
        offset,
        with_payload: ['title'],
      });

      for (const point of result.points) {
        if (point.payload && typeof point.payload === 'object' && 'title' in point.payload) {
          titles.add(point.payload.title as string);
        }
      }

      if (!result.next_page_offset) {
        break;
      }

      const nextOffset = result.next_page_offset;
      if (typeof nextOffset === 'string' || typeof nextOffset === 'number') {
        offset = nextOffset;
      } else {
        break;
      }
    }

    return Array.from(titles).sort();
  } catch {
    return [];
  }
}
