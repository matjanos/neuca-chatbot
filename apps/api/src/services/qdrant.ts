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

/** Fetch specific chunks by datasetId and chunkIndex */
async function fetchChunksByIndex(
  requests: Array<{ datasetId: string; chunkIndex: number }>
): Promise<SearchResult[]> {
  if (requests.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  // Batch requests by datasetId for efficiency
  const byDataset = new Map<string, number[]>();
  for (const { datasetId, chunkIndex } of requests) {
    if (!byDataset.has(datasetId)) {
      byDataset.set(datasetId, []);
    }
    byDataset.get(datasetId)!.push(chunkIndex);
  }

  // Fetch chunks for each dataset
  for (const [datasetId, indices] of byDataset) {
    const filter = {
      must: [
        { key: 'datasetId', match: { value: datasetId } },
        { key: 'chunkIndex', match: { any: indices } },
      ],
    };

    const scrollResult = await getQdrantClient().scroll(COLLECTION_NAME, {
      filter,
      limit: indices.length,
      with_payload: true,
    });

    for (const point of scrollResult.points) {
      results.push({
        payload: point.payload as unknown as ChunkPayload,
        score: 0, // Neighbors don't have semantic search scores
      });
    }
  }

  return results;
}

/** Expand search results with neighboring chunks (prev/next) */
async function expandWithNeighbors(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) {
    return results;
  }

  const neighborsToFetch: Array<{ datasetId: string; chunkIndex: number }> = [];
  const existingIndices = new Set<string>(); // "datasetId:chunkIndex"

  // Collect existing chunk indices
  for (const result of results) {
    const key = `${result.payload.datasetId}:${result.payload.chunkIndex}`;
    existingIndices.add(key);
  }

  // Collect neighbor indices to fetch
  for (const result of results) {
    const { datasetId, prevChunkIndex, nextChunkIndex } = result.payload;

    if (prevChunkIndex !== null) {
      const key = `${datasetId}:${prevChunkIndex}`;
      if (!existingIndices.has(key)) {
        neighborsToFetch.push({ datasetId, chunkIndex: prevChunkIndex });
        existingIndices.add(key); // Avoid duplicate fetches
      }
    }

    if (nextChunkIndex !== null) {
      const key = `${datasetId}:${nextChunkIndex}`;
      if (!existingIndices.has(key)) {
        neighborsToFetch.push({ datasetId, chunkIndex: nextChunkIndex });
        existingIndices.add(key);
      }
    }
  }

  if (neighborsToFetch.length === 0) {
    return results;
  }

  console.log(`[qdrant] Fetching ${neighborsToFetch.length} neighboring chunks`);
  const neighbors = await fetchChunksByIndex(neighborsToFetch);

  // Merge and sort: original results first (by score), then neighbors (by chunkIndex)
  const allResults = [...results, ...neighbors];

  // Sort by: primary score desc, secondary chunkIndex asc
  allResults.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score; // Higher scores first
    }
    return a.payload.chunkIndex - b.payload.chunkIndex; // Then by chunk order
  });

  return allResults;
}

/** Search for similar chunks by vector */
export async function searchSimilar(
  queryVector: number[],
  options: {
    title?: string;
    limit?: number;
    query?: string; // Original query text for tracing
    expandNeighbors?: boolean; // Whether to fetch prev/next chunks
  } = {}
): Promise<SearchResult[]> {
  const {
    title,
    limit = RAG_CONFIG.topK,
    query,
    expandNeighbors = RAG_CONFIG.expandWithNeighbors,
  } = options;
  const startTime = Date.now();
  console.log(`[qdrant] Searching for "${query?.slice(0, 50) ?? 'no query'}...", title filter: ${title ?? 'none'}, limit: ${limit}, expand: ${expandNeighbors}`);

  return tracer.startActiveSpan('qdrant.search', async (span) => {
    try {
      // Input: structured search parameters
      const inputData = {
        query: query || null,
        collection: COLLECTION_NAME,
        limit,
        filter: title ? { title } : null,
        vector_dimensions: queryVector.length,
        expand_neighbors: expandNeighbors,
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

      let finalResults = results.map((r) => ({
        payload: r.payload as unknown as ChunkPayload,
        score: r.score,
      }));

      // Expand with neighbors if enabled
      if (expandNeighbors) {
        finalResults = await expandWithNeighbors(finalResults);
        console.log(`[qdrant] Expanded to ${finalResults.length} total chunks (including neighbors)`);
      }

      // Output: search results with scores and content preview
      const outputData = {
        results_count: finalResults.length,
        original_count: results.length,
        expanded: expandNeighbors,
        results: finalResults.slice(0, 5).map((r, i) => {
          return {
            rank: i + 1,
            score: r.score,
            chunk_index: r.payload.chunkIndex,
            speaker: r.payload.speaker,
            time_range: `${r.payload.startSec}-${r.payload.endSec}s`,
            text_preview: r.payload.text.substring(0, 200) + (r.payload.text.length > 200 ? '...' : ''),
          };
        }),
      };
      span.setAttribute('output.value', JSON.stringify(outputData));
      span.setStatus({ code: SpanStatusCode.OK });

      return finalResults;
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
