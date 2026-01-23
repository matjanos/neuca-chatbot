import { QdrantClient } from '@qdrant/js-client-rest';
import type { ChunkPayload, TranscriptChunk } from '../types.js';

/** Default Qdrant configuration */
const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'transcripts';

/** Point ID format: yt-{videoId}:{chunkIndex:06d} */
function formatPointId(datasetId: string, chunkIndex: number): string {
  return `${datasetId}:${chunkIndex.toString().padStart(6, '0')}`;
}

/** Create Qdrant client */
export function createQdrantClient(): QdrantClient {
  const url = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  return new QdrantClient({
    url,
    apiKey: apiKey || undefined,
  });
}

/**
 * Check if Qdrant is reachable
 */
export async function checkQdrantConnection(client: QdrantClient): Promise<boolean> {
  try {
    await client.getCollections();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure collection exists with proper configuration
 */
export async function ensureCollection(
  client: QdrantClient,
  vectorSize: number
): Promise<void> {
  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!exists) {
      // Create collection with cosine distance
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
        // Optimized for filtering
        optimizers_config: {
          indexing_threshold: 10000,
        },
      });

      // Create payload indexes for efficient filtering
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'datasetId',
        field_schema: 'keyword',
      });

      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'speaker',
        field_schema: 'keyword',
      });

      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'chunkIndex',
        field_schema: 'integer',
      });
    }
  } catch (error) {
    throw new Error(`Failed to ensure collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Upsert chunks with embeddings to Qdrant
 */
export async function upsertChunks(
  client: QdrantClient,
  chunks: TranscriptChunk[],
  embeddings: number[][],
  metadata: {
    datasetId: string;
    docId: string;
    sourceType: 'youtube' | 'file' | 'url';
    sourceUrl: string;
    title: string;
    language: string;
  }
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error('Chunks and embeddings count mismatch');
  }

  const points = chunks.map((chunk, i) => ({
    id: formatPointId(metadata.datasetId, chunk.chunkIndex),
    vector: embeddings[i],
    payload: {
      datasetId: metadata.datasetId,
      docId: metadata.docId,
      sourceType: metadata.sourceType,
      sourceUrl: metadata.sourceUrl,
      title: metadata.title,
      language: metadata.language,
      chunkIndex: chunk.chunkIndex,
      startSec: Math.floor(chunk.startMs / 1000),
      endSec: Math.floor(chunk.endMs / 1000),
      speaker: chunk.speaker,
      text: chunk.text,
      segmentIds: chunk.segmentIndices.map(i => `seg-${i}`),
      tokenCount: chunk.tokenCount,
      version: '1.0',
      ingestedAt: new Date().toISOString(),
    } as Record<string, unknown>,
  }));

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch,
    });
  }
}

/**
 * Search for similar chunks
 */
export async function searchSimilar(
  client: QdrantClient,
  queryVector: number[],
  options: {
    datasetId?: string;
    speaker?: string;
    limit?: number;
  } = {}
): Promise<Array<{ payload: ChunkPayload; score: number }>> {
  const { datasetId, speaker, limit = 5 } = options;

  const filter: any = { must: [] };

  if (datasetId) {
    filter.must.push({
      key: 'datasetId',
      match: { value: datasetId },
    });
  }

  if (speaker) {
    filter.must.push({
      key: 'speaker',
      match: { value: speaker },
    });
  }

  const results = await client.search(COLLECTION_NAME, {
    vector: queryVector,
    filter: filter.must.length > 0 ? filter : undefined,
    limit,
    with_payload: true,
  });

  return results.map(r => ({
    payload: r.payload as unknown as ChunkPayload,
    score: r.score,
  }));
}

/**
 * Get chunks by index range (for context expansion)
 */
export async function getChunksByIndices(
  client: QdrantClient,
  datasetId: string,
  indices: number[]
): Promise<ChunkPayload[]> {
  if (indices.length === 0) {
    return [];
  }

  const pointIds = indices.map(i => formatPointId(datasetId, i));

  const results = await client.retrieve(COLLECTION_NAME, {
    ids: pointIds,
    with_payload: true,
  });

  return results
    .filter(r => r.payload)
    .map(r => r.payload as unknown as ChunkPayload)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/**
 * Get context-expanded chunks (original + neighbors)
 */
export async function getExpandedContext(
  client: QdrantClient,
  queryVector: number[],
  options: {
    datasetId?: string;
    limit?: number;
    contextWindow?: number; // Number of chunks to add before/after
  } = {}
): Promise<ChunkPayload[]> {
  const { datasetId, limit = 3, contextWindow = 1 } = options;

  // First, search for best matching chunks
  const searchResults = await searchSimilar(client, queryVector, {
    datasetId,
    limit,
  });

  if (searchResults.length === 0) {
    return [];
  }

  // Collect all chunk indices including neighbors
  const chunkIndicesSet = new Set<number>();
  const datasetIds = new Set<string>();

  for (const result of searchResults) {
    const idx = result.payload.chunkIndex;
    datasetIds.add(result.payload.datasetId);

    // Add original and neighbors
    for (let offset = -contextWindow; offset <= contextWindow; offset++) {
      const neighborIdx = idx + offset;
      if (neighborIdx >= 0) {
        chunkIndicesSet.add(neighborIdx);
      }
    }
  }

  // Fetch all chunks (only works well with single datasetId)
  const targetDatasetId = datasetId || Array.from(datasetIds)[0];
  const chunks = await getChunksByIndices(
    client,
    targetDatasetId,
    Array.from(chunkIndicesSet)
  );

  return chunks;
}

/**
 * Delete all chunks for a dataset
 */
export async function deleteDataset(
  client: QdrantClient,
  datasetId: string
): Promise<number> {
  // First, count matching points
  const countResult = await client.count(COLLECTION_NAME, {
    filter: {
      must: [
        {
          key: 'datasetId',
          match: { value: datasetId },
        },
      ],
    },
    exact: true,
  });

  const count = countResult.count;

  if (count > 0) {
    // Delete by filter
    await client.delete(COLLECTION_NAME, {
      wait: true,
      filter: {
        must: [
          {
            key: 'datasetId',
            match: { value: datasetId },
          },
        ],
      },
    });
  }

  return count;
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(client: QdrantClient): Promise<{
  exists: boolean;
  pointCount: number;
  vectorSize: number | null;
}> {
  try {
    const info = await client.getCollection(COLLECTION_NAME);
    let vectorSize: number | null = null;

    if (info.config?.params?.vectors) {
      const vectors = info.config.params.vectors;
      if (typeof vectors === 'object' && vectors !== null && 'size' in vectors) {
        const size = (vectors as { size: number }).size;
        vectorSize = typeof size === 'number' ? size : null;
      }
    }

    return {
      exists: true,
      pointCount: info.points_count || 0,
      vectorSize,
    };
  } catch (error) {
    return {
      exists: false,
      pointCount: 0,
      vectorSize: null,
    };
  }
}

/**
 * List all unique datasets in the collection
 */
export async function listDatasets(client: QdrantClient): Promise<string[]> {
  try {
    // Scroll through all points and collect unique datasetIds
    const datasets = new Set<string>();

    let offset: string | number | undefined = undefined;
    const limit = 100;

    while (true) {
      const result = await client.scroll(COLLECTION_NAME, {
        limit,
        offset,
        with_payload: ['datasetId'],
      });

      for (const point of result.points) {
        if (point.payload && typeof point.payload === 'object' && 'datasetId' in point.payload) {
          datasets.add(point.payload.datasetId as string);
        }
      }

      if (!result.next_page_offset) {
        break;
      }
      // next_page_offset can be string, number, or Record<string, unknown>
      const nextOffset = result.next_page_offset;
      if (typeof nextOffset === 'string' || typeof nextOffset === 'number') {
        offset = nextOffset;
      } else {
        break; // Unknown offset type, stop scrolling
      }
    }

    return Array.from(datasets).sort();
  } catch (error) {
    return [];
  }
}
