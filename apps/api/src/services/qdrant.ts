import { QdrantClient } from '@qdrant/js-client-rest';
import type { ChunkPayload, SearchResult } from '../types.js';
import { RAG_CONFIG } from '../config.js';

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
  } = {}
): Promise<SearchResult[]> {
  const { title, limit = RAG_CONFIG.topK } = options;

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

  return results.map((r) => ({
    payload: r.payload as unknown as ChunkPayload,
    score: r.score,
  }));
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
