import {
  spinner,
  select,
  confirm,
  isCancel,
  cancel,
  note,
  log,
} from '@clack/prompts';
import pc from 'picocolors';
import { readdirSync, existsSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

import type { EmbeddingModel, ChunkingConfig } from '../types.js';
import { parseTranscriptFile } from '../utils/transcript-io.js';
import {
  chunkTranscript,
  getChunkingStats,
  DEFAULT_CHUNKING_CONFIG,
} from '../services/chunking.js';
import {
  generateEmbeddings,
  estimateEmbeddingCost,
  getModelInfo,
  EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_CONFIG,
} from '../services/embedding.js';
import {
  createQdrantClient,
  checkQdrantConnection,
  ensureCollection,
  upsertChunks,
  getCollectionStats,
  deleteDataset,
} from '../services/qdrant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * List available transcript files in the output directory
 */
function listTranscriptFiles(): { value: string; label: string }[] {
  const outputDir = resolve(__dirname, '../../../../output');

  if (!existsSync(outputDir)) {
    return [];
  }

  const files = readdirSync(outputDir)
    .filter(f => f.startsWith('transcript-') && f.endsWith('.txt'))
    .sort((a, b) => b.localeCompare(a)); // Newest first

  return files.map(f => ({
    value: join(outputDir, f),
    label: f,
  }));
}

/**
 * Format duration for display
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

/**
 * Chunking presets
 */
const CHUNKING_PRESETS: Record<string, { config: ChunkingConfig; description: string }> = {
  balanced: {
    config: DEFAULT_CHUNKING_CONFIG,
    description: 'Balanced (400 tokens, 20% overlap) - recommended for most transcripts',
  },
  detailed: {
    config: { chunkSize: 200, overlapTokens: 50, minChunkSize: 50 },
    description: 'Detailed (200 tokens) - more granular, better for short-form Q&A',
  },
  overview: {
    config: { chunkSize: 800, overlapTokens: 100, minChunkSize: 150 },
    description: 'Overview (800 tokens) - fewer chunks, better for summarization',
  },
};

/**
 * Main command to generate embeddings for a transcript
 */
export async function generateEmbeddingsCommand(
  transcriptPath?: string
): Promise<string | null> {
  const s = spinner();

  // Step 1: Check Qdrant connection
  s.start('Checking Qdrant connection...');

  const client = createQdrantClient();
  const isConnected = await checkQdrantConnection(client);

  if (!isConnected) {
    s.stop(pc.red('Qdrant not reachable'));
    log.error('Could not connect to Qdrant at localhost:6333');
    log.info('Make sure Qdrant is running:');
    log.info(pc.dim('  docker compose up -d'));
    return null;
  }

  s.stop(pc.green('Qdrant connected'));

  // Step 2: Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    log.error('OPENAI_API_KEY not found in environment');
    log.info('Add to .env file: OPENAI_API_KEY=your_api_key_here');
    return null;
  }

  // Step 3: Select transcript if not provided
  if (!transcriptPath) {
    const transcripts = listTranscriptFiles();

    if (transcripts.length === 0) {
      log.error('No transcript files found in output/ directory');
      log.info('Run a transcription first to create transcript files');
      return null;
    }

    const selected = await select({
      message: 'Select a transcript to embed:',
      options: transcripts,
    });

    if (isCancel(selected)) {
      cancel('Operation cancelled');
      return null;
    }

    transcriptPath = selected as string;
  }

  // Step 4: Parse transcript
  s.start('Loading transcript...');
  const transcript = parseTranscriptFile(transcriptPath);

  if (!transcript) {
    s.stop(pc.red('Failed to parse transcript'));
    return null;
  }

  if (transcript.segments.length === 0) {
    s.stop(pc.red('No segments found in transcript'));
    return null;
  }

  const videoId = transcript.videoInfo.id;
  const datasetId = `yt-${videoId}`;

  s.stop(`Loaded ${transcript.segments.length} segments from "${transcript.videoInfo.title}"`);

  // Step 5: Check if dataset already exists
  const stats = await getCollectionStats(client);
  if (stats.exists) {
    // Check if this specific dataset exists
    const existingChunks = await client.count('transcripts', {
      filter: {
        must: [{ key: 'datasetId', match: { value: datasetId } }],
      },
      exact: true,
    }).catch(() => ({ count: 0 }));

    if (existingChunks.count > 0) {
      log.warn(`Dataset ${datasetId} already has ${existingChunks.count} chunks`);

      const overwrite = await confirm({
        message: 'Do you want to replace existing embeddings?',
      });

      if (isCancel(overwrite)) {
        cancel('Operation cancelled');
        return null;
      }

      if (overwrite) {
        s.start('Deleting existing embeddings...');
        await deleteDataset(client, datasetId);
        s.stop('Existing embeddings deleted');
      } else {
        cancel('Operation cancelled');
        return null;
      }
    }
  }

  // Step 6: Select embedding model
  const modelSelection = await select({
    message: 'Select embedding model:',
    options: [
      {
        value: 'text-embedding-3-large',
        label: 'text-embedding-3-large (Recommended) - 3072 dims, higher quality',
      },
      {
        value: 'text-embedding-3-small',
        label: 'text-embedding-3-small - 1536 dims, faster and cheaper',
      },
    ],
  });

  if (isCancel(modelSelection)) {
    cancel('Operation cancelled');
    return null;
  }

  const embeddingModel = modelSelection as EmbeddingModel;
  const modelInfo = getModelInfo(embeddingModel);

  // Step 7: Select chunking preset
  const chunkingSelection = await select({
    message: 'Select chunking strategy:',
    options: [
      { value: 'balanced', label: CHUNKING_PRESETS.balanced.description },
      { value: 'detailed', label: CHUNKING_PRESETS.detailed.description },
      { value: 'overview', label: CHUNKING_PRESETS.overview.description },
    ],
  });

  if (isCancel(chunkingSelection)) {
    cancel('Operation cancelled');
    return null;
  }

  const chunkingConfig = CHUNKING_PRESETS[chunkingSelection as string].config;

  // Step 8: Chunk transcript
  s.start('Chunking transcript...');
  const chunks = chunkTranscript(transcript.segments, chunkingConfig);
  const chunkStats = getChunkingStats(chunks);
  s.stop(`Created ${chunkStats.totalChunks} chunks (avg ${chunkStats.avgTokensPerChunk} tokens)`);

  // Show chunking details
  const estimatedCost = estimateEmbeddingCost(chunkStats.totalTokens, embeddingModel);
  note(
    [
      `Chunks: ${chunkStats.totalChunks}`,
      `Total tokens: ${chunkStats.totalTokens.toLocaleString()}`,
      `Token range: ${chunkStats.minTokens} - ${chunkStats.maxTokens}`,
      `Model: ${modelInfo.name} (${modelInfo.dimensions} dims)`,
      `Estimated cost: $${estimatedCost.toFixed(4)}`,
    ].join('\n'),
    'Embedding summary'
  );

  // Confirm before proceeding
  const shouldProceed = await confirm({
    message: 'Generate embeddings and store in Qdrant?',
  });

  if (isCancel(shouldProceed) || !shouldProceed) {
    cancel('Operation cancelled');
    return null;
  }

  // Step 9: Ensure collection exists
  s.start('Ensuring Qdrant collection...');
  await ensureCollection(client, EMBEDDING_DIMENSIONS[embeddingModel]);
  s.stop('Collection ready');

  // Step 10: Generate embeddings
  s.start(`Generating embeddings (${chunks.length} chunks)...`);
  const startTime = Date.now();

  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(
      chunks.map(c => c.text),
      { model: embeddingModel, batchSize: DEFAULT_EMBEDDING_CONFIG.batchSize }
    );
  } catch (error) {
    s.stop(pc.red('Failed to generate embeddings'));
    log.error(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }

  const embeddingTime = Math.round((Date.now() - startTime) / 1000);
  s.stop(`Embeddings generated in ${formatDuration(embeddingTime)}`);

  // Step 11: Store in Qdrant
  s.start('Storing in Qdrant...');

  try {
    await upsertChunks(client, chunks, embeddings, {
      datasetId,
      docId: videoId,
      sourceType: 'youtube',
      sourceUrl: transcript.videoInfo.url,
      title: transcript.videoInfo.title,
      language: 'auto', // Could be extracted from transcript metadata
    });
  } catch (error) {
    s.stop(pc.red('Failed to store in Qdrant'));
    log.error(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }

  s.stop('Stored in Qdrant');

  // Final summary
  const finalStats = await getCollectionStats(client);
  note(
    [
      `Dataset ID: ${datasetId}`,
      `Chunks stored: ${chunks.length}`,
      `Collection total: ${finalStats.pointCount} points`,
      ``,
      `Query this dataset with:`,
      pc.dim(`  datasetId: "${datasetId}"`),
    ].join('\n'),
    'Embedding complete'
  );

  return datasetId;
}
