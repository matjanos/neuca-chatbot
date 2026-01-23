import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import app from '../src/index.js';

// Mock modules
const mockGenerateText = mock(() => Promise.resolve({ text: 'Mocked LLM response' }));
const mockStreamText = mock(() => ({
  textStream: (async function* () {
    yield 'Mocked ';
    yield 'streaming ';
    yield 'response';
  })(),
}));
const mockEmbed = mock(() => Promise.resolve({ embedding: new Array(3072).fill(0.1) }));

// Mock Qdrant responses
const mockQdrantSearch = mock(() => Promise.resolve([
  {
    id: 'test-id-1',
    score: 0.9,
    payload: {
      title: 'Test Lecture',
      text: 'This is test transcript content.',
      speaker: 'Test Speaker',
      startSec: 60,
      endSec: 120,
      chunkIndex: 0,
      datasetId: 'test-dataset',
    },
  },
]));

const mockQdrantScroll = mock(() => Promise.resolve({
  points: [{ payload: { title: 'Test Lecture' } }],
  next_page_offset: null,
}));

const mockQdrantGetCollections = mock(() => Promise.resolve({ collections: [{ name: 'transcripts' }] }));
const mockQdrantGetCollection = mock(() => Promise.resolve({ points_count: 100 }));

// Apply mocks
mock.module('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

mock.module('@ai-sdk/openai', () => ({
  openai: () => 'mocked-model',
}));

mock.module('../src/services/embedding.js', () => ({
  generateQueryEmbedding: () => Promise.resolve(new Array(3072).fill(0.1)),
}));

mock.module('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    search = mockQdrantSearch;
    scroll = mockQdrantScroll;
    getCollections = mockQdrantGetCollections;
    getCollection = mockQdrantGetCollection;
  },
}));

// Helper to make requests
async function request(path: string, options?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, options));
}

describe('API Endpoints', () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockStreamText.mockClear();
    mockQdrantSearch.mockClear();
    mockQdrantScroll.mockClear();
  });

  describe('GET /health', () => {
    test('returns health status', async () => {
      const res = await request('/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.qdrant).toBeDefined();
      expect(body.qdrant.connected).toBe(true);
    });
  });

  describe('POST /completion', () => {
    test('returns error for missing message', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('message is required');
    });

    test('returns completion response', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What is the main topic?' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.conversationId).toBeDefined();
      expect(body.message).toBeDefined();
      expect(typeof body.message).toBe('string');
    });

    test('includes sources when available', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Tell me about the lecture' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      // Sources should be included when RAG returns results
      if (body.sources) {
        expect(Array.isArray(body.sources)).toBe(true);
        expect(body.sources[0]).toHaveProperty('text');
        expect(body.sources[0]).toHaveProperty('speaker');
        expect(body.sources[0]).toHaveProperty('startSec');
        expect(body.sources[0]).toHaveProperty('endSec');
      }
    });

    test('maintains conversation with same conversationId', async () => {
      // First message
      const res1 = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      const body1 = await res1.json();
      const conversationId = body1.conversationId;

      // Second message with same conversationId
      const res2 = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: 'Follow up question'
        }),
      });
      const body2 = await res2.json();

      expect(body2.conversationId).toBe(conversationId);
    });

    test('accepts lectureTitle parameter', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What was discussed?',
          lectureTitle: 'Test Lecture'
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.selectedLecture).toBe('Test Lecture');
    });
  });

  describe('POST /completion (streaming)', () => {
    test('returns streaming response', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is AI?',
          stream: true
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const text = await res.text();

      // Should contain metadata event
      expect(text).toContain('data: ');
      expect(text).toContain('"type":"metadata"');

      // Should contain text events
      expect(text).toContain('"type":"text"');

      // Should contain done event
      expect(text).toContain('"type":"done"');
    });

    test('streaming includes conversationId in metadata', async () => {
      const res = await request('/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test question',
          stream: true
        }),
      });

      const text = await res.text();
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      // First event should be metadata
      const firstEvent = JSON.parse(lines[0].slice(6));
      expect(firstEvent.type).toBe('metadata');
      expect(firstEvent.conversationId).toBeDefined();
    });
  });
});

describe('Request Validation', () => {
  test('rejects non-string message', async () => {
    const res = await request('/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 123 }),
    });

    expect(res.status).toBe(400);
  });

  test('rejects empty message', async () => {
    const res = await request('/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });

    expect(res.status).toBe(400);
  });
});
