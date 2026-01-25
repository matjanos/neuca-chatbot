# Neuca Chatbot - Business & Technical Presentation Guide

**Target Audience:** Business stakeholders, compliance teams, decision-makers
**Purpose:** Demonstrate production-ready AI chatbot for pharmaceutical knowledge management
**Context:** Recruitment task - AI panel discussion Q&A system

---

## 1. Business Goal & Use Cases

### Why This Matters for NEUCA

**Primary Use Case:**
Enable teams to quickly extract insights from recorded educational content (conferences, panels, training sessions) without watching hours of video.

**Business Value:**
- **Time Savings:** 2-hour panel → 30-second answer retrieval
- **Knowledge Retention:** Convert ephemeral video content into searchable organizational knowledge
- **Compliance Training:** Track what topics were covered, when, and by whom
- **Onboarding Acceleration:** New employees can query archived training sessions
- **Decision Support:** Quick fact-checking from expert discussions

**Real-World Scenarios:**
1. **Regulatory Affairs:** "What did the expert say about AI Act compliance during the March panel?"
2. **Research Team:** "Summarize all mentions of machine learning in clinical trials"
3. **Management:** "What challenges were discussed regarding AI implementation in Poland?"
4. **Quality Assurance:** "Who spoke about validation requirements and at what timestamp?"

**Extensibility Beyond This Demo:**
- Internal company town halls
- Customer webinars
- Partner presentations
- Industry conference recordings
- Training certification programs

---

## 2. System Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE (CLI)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  YouTube URL → Audio Download → Transcription → Chunking        │
│                                    ↓                              │
│                            Speaker Diarization                    │
│                                    ↓                              │
│                            Embed (OpenAI)                         │
│                                    ↓                              │
│                        Store in Vector Database                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RETRIEVAL PIPELINE (API)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User Query → PII Check → Embed Query → Search Vector DB        │
│                                    ↓                              │
│                        Retrieve Top 8 Chunks                      │
│                                    ↓                              │
│                    Build RAG Context with Sources                 │
│                                    ↓                              │
│                    GPT-5-mini Generates Answer                    │
│                                    ↓                              │
│                Stream Response with Citations                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  • Web Chat Interface (Text + Timestamp Links)                   │
│  • Voice Assistant (ElevenLabs Polish Voice)                     │
│  • CLI Tool (Admin/Data Management)                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

1. **CLI Application** - Data ingestion pipeline
   - Downloads YouTube videos as audio
   - Transcribes using AssemblyAI (cloud) or Whisper (local GPU)
   - Identifies speakers automatically
   - Chunks transcript intelligently (speaker-aware or token-based)
   - Generates embeddings and stores in vector database

2. **API Backend** - RAG query engine
   - Receives user questions
   - Performs PII detection (blocks sensitive data)
   - Retrieves relevant context from vector database
   - Generates answers using GPT-5-mini
   - Streams responses with source citations

3. **Web Frontend** - User interface
   - Chat interface with message history
   - Clickable timestamps that link to video
   - Reasoning transparency (shows AI thinking process)
   - Multi-lecture selection

4. **Voice Interface** - Accessibility option
   - Polish-language voice conversation
   - Same backend logic as text chat
   - ElevenLabs integration

5. **Vector Database** - Qdrant
   - Stores 3072-dimensional embeddings
   - Enables semantic search (meaning-based, not keyword)
   - Metadata includes speaker, timestamps, lecture title

6. **PII Protection** - Microsoft Presidio
   - Analyzes queries before processing
   - Blocks requests containing personal data
   - Prevents accidental data leakage

---

## 3. Traceability & Audit Trail

### Citation Mechanism

**Every answer includes source references:**
```
According to [Speaker Name] at [timestamp], "exact quote..."

Based on the discussion at [00:15:30], the panel mentioned...
```

**Timestamp Format:**
- `[MM:SS]` or `[HH:MM:SS]` displayed in chat
- Clickable links that open video at exact moment
- Preserves original context for verification

**Metadata Tracked Per Chunk:**
```json
{
  "speaker": "Prof. Jan Kowalski",
  "startSec": 930,
  "endSec": 965,
  "text": "AI regulation in Poland...",
  "lectureTitle": "Co czeka Polskę w świecie AI?",
  "ingestedAt": "2026-01-25T10:30:00Z",
  "chunkIndex": 42,
  "videoId": "Ya5Cg9qRspg"
}
```

**Audit Capabilities:**
- **Who said it:** Speaker identification preserved
- **When:** Exact timestamp down to the second
- **Where:** YouTube video URL + seek position
- **Version:** Ingestion timestamp tracks data lineage
- **Context:** Previous/next chunk navigation for fuller context

**User Trust Building:**
- "Click the source" - verify AI answer against original video
- No hallucination without evidence (system rejects if no relevant chunks found)
- Transparent reasoning (optional toggle shows AI's thinking process)

---

## 4. Limitations & Scope

### What the System CAN Do

✅ Answer factual questions about panel content
✅ Summarize discussions on specific topics
✅ Find who said what and when
✅ Compare viewpoints of different speakers
✅ Navigate across multiple recorded lectures
✅ Provide timestamp-linked sources for verification

### What the System CANNOT Do

❌ **Not Legal Advice** - Chatbot does not provide regulatory compliance guidance
❌ **Not Medical Advice** - Cannot diagnose or recommend treatments
❌ **No Real-Time Updates** - Only knows content from ingested videos
❌ **Limited to Transcription Quality** - Accuracy depends on audio quality and speaker clarity
❌ **No External Knowledge** - Only answers from the specific panel recordings (by design)
❌ **Cannot Interpret Intent** - If question is outside scope, refuses rather than guesses

### Clear Boundaries Communicated

**System Prompts Include:**
```
You are an assistant that answers questions ONLY based on provided context.
If the context doesn't contain the answer, politely say so.
Never make up information not present in the sources.
```

**Example Refusal:**
```
User: "What is the AI Act Article 5?"
Bot: "Przepraszam, ale w moim kontekście z panelu dyskusyjnego nie ma szczegółów
      dotyczących konkretnych artykułów AI Act. Mogę jednak podsumować to, co
      paneliści mówili o AI Act w ogóle. Czy chcesz, żebym to zrobił?"
```

**Scope Declaration in UI:**
- Homepage clearly states: "Ask questions about the AI panel discussion"
- Chat interface shows available lectures
- Error messages guide users to rephrase within scope

---

## 5. Hallucination Avoidance Strategy

### Evidence-First Architecture

**1. Retrieval-Augmented Generation (RAG)**
- Answer MUST be grounded in retrieved chunks
- No retrieval = No answer (safe rejection)

**2. Confidence Thresholds**
```typescript
RAG_CONFIG = {
  topK: 8,                    // Retrieve top 8 most relevant chunks
  scoreThreshold: 0.3         // Minimum similarity score (0-1)
}
```
- If no chunk scores above 0.3, system responds: "I don't have information about that"
- Lower threshold (0.3) allows broader retrieval for general questions
- Higher threshold (0.5+) would be stricter but miss more queries

**3. Refusal Mode**
System prompt explicitly instructs:
```
If the context does not contain information to answer the question:
- DO NOT speculate or use general knowledge
- DO NOT make up timestamps or speaker names
- Politely state that the information is not in the available content
- Suggest rephrasing or ask if user wants a summary instead
```

**4. Source Attribution Required**
- Every factual claim must reference a chunk
- Chunks include speaker and timestamp
- Forces LLM to cite evidence, not invent

**5. Reasoning Transparency**
- `reasoningEffort: 'medium'` setting in GPT-5-mini
- Optional UI toggle to show internal reasoning
- Users can see how AI arrived at conclusion

**6. No External Knowledge Injection**
- System prompt does NOT include general AI knowledge
- Model instructed to ignore pre-training when no context matches
- Prevents blending of panel content with GPT's world knowledge

### Quality Controls

**Negative Test Cases:**
- "What is the capital of France?" → Should refuse (out of scope)
- "Who is the CEO of OpenAI?" → Should refuse (not in panel)
- "What will happen in 2027?" → Should refuse (panel is past event)

**Regression Testing:**
- Known good question/answer pairs tracked
- Ensures updates don't degrade quality
- CLI tool can re-run test queries

---

## 6. Security & Privacy

### PII Detection Pipeline

**Microsoft Presidio Integration:**
- Runs BEFORE query reaches vector database or LLM
- Detects: Names, emails, phone numbers, addresses, credit cards, PESEL, etc.
- Language: English model (universal patterns still work for Polish data)

**Configuration:**
```typescript
PII_CONFIG = {
  scoreThreshold: 0.9,        // High confidence to avoid false positives
  enabled: true,              // Fail-safe: can disable if needed
  analyzerUrl: 'http://localhost:5002'
}
```

**Response on Detection:**
```json
{
  "error": "⚠️ Wykryto dane osobowe w Twoim zapytaniu.
            Ze względów bezpieczeństwa nie mogę przetworzyć tej wiadomości."
}
```

**What PII is NEVER Logged:**
- User query text (if PII detected)
- Actual PII values
- Only metadata: `{ "piiDetected": true, "entityCount": 2 }`

### Data Retention & Deletion

**Transcript Storage:**
- Source: `output/transcript-{videoId}-{timestamp}.txt`
- Vector DB: Qdrant collection "transcripts"
- Audio Cache: `temp/{videoId}.mp3` (can be deleted after transcription)

**Deletion Process:**
```bash
# CLI command to remove dataset
bun run cli
→ Select "Delete Dataset"
→ Choose lecture by title or video ID
→ Confirm deletion
→ All chunks removed from Qdrant
```

**Retention Policy (Example):**
- Keep transcripts indefinitely (organizational knowledge)
- Delete audio files after 30 days (storage optimization)
- Archive embeddings yearly (compliance requirement)
- Log all deletions with timestamp and operator ID

**Access Control (Future Enhancement):**
- Currently: No authentication (demo system)
- Production: API key per team, role-based access
- Qdrant supports tenant isolation via namespaces

### Privacy by Design

**Anonymization Options:**
- Speaker IDs can be pseudonymized: "Speaker A" instead of "Jan Kowalski"
- CLI tool allows manual speaker renaming
- Timestamps preserved but speaker names redacted

**Data Minimization:**
- Only stores what's needed: text, speaker, timestamp
- No unnecessary metadata (IP addresses, user IDs, etc.)
- Embeddings are numerical vectors (not reversible to original text)

---

## 7. AI Act & Compliance-by-Design

### Risk Classification

**EU AI Act Assessment:**
- **Use Case:** Knowledge retrieval from public educational content
- **Risk Level:** Minimal/Low Risk
  - No automated decision-making affecting individuals
  - No biometric identification
  - No critical infrastructure control
  - No employment or education decisioning

**Compliance Controls:**

### 1. Transparency (Article 52)
✅ Users informed they're interacting with AI
✅ Chatbot identifies as "Neucacz" (AI assistant)
✅ UI clearly states "AI-powered Q&A system"
✅ Reasoning process optionally visible

### 2. Human Oversight
✅ Timestamp links allow human verification
✅ Refusal mode prevents unsupported claims
✅ Admins can review query logs in Langfuse
✅ Manual speaker identification/correction in CLI

### 3. Data Governance
✅ Clear data lineage: YouTube URL → transcript → chunks → answers
✅ Version tracking (`ingestedAt` timestamp)
✅ Deletion capabilities (GDPR Article 17)
✅ PII detection before processing

### 4. Accuracy & Robustness
✅ Source attribution required (no hallucination)
✅ Evidence-first RAG architecture
✅ Confidence thresholds prevent low-quality answers
✅ Observability traces (detect degradation)

### 5. Technical Documentation
✅ `CLAUDE.md` - Architecture decisions
✅ `TECHNICAL_LOG.md` - Development history
✅ `README.md` - User instructions
✅ API documentation (OpenAPI/Swagger potential)

### Governance Framework

**Roles & Responsibilities:**
- **Data Owner:** Team that creates/uploads recordings
- **Data Custodian:** Admin who ingests via CLI
- **Data Steward:** Compliance officer who audits usage
- **End Users:** Employees querying the system

**Change Control:**
- Git version control for code
- Semantic versioning (currently v1.0)
- Changelog tracks feature additions
- Rollback capability via Docker tags

**Risk Mitigation:**
- Regular audits of query logs (detect misuse)
- PII detection prevents data leakage
- Fail-safe refusals prevent liability
- Timestamp verification builds trust

---

## 8. Quality & Metrics

### Retrieval Quality Metrics

**Recall@K:**
- **Definition:** Of all relevant chunks, how many did we retrieve in top K?
- **Current K=8:** Retrieve 8 most similar chunks per query
- **Target:** >80% recall for known questions

**Precision@K:**
- **Definition:** Of the K chunks retrieved, how many are actually relevant?
- **Target:** >60% precision (avoid noise)

**Mean Reciprocal Rank (MRR):**
- **Definition:** How high did the BEST chunk rank?
- **Target:** MRR > 0.7 (best chunk usually in top 3)

**Score Distribution:**
- Threshold: 0.3 minimum similarity
- Ideal: Top chunks score >0.6 (strong semantic match)
- Monitor: Are queries consistently scoring <0.4? (may need re-indexing)

### LLM Quality Metrics

**Faithfulness:**
- **Definition:** Does answer stay true to retrieved sources?
- **Test:** Compare answer claims to chunk text (RAGAS framework)
- **Target:** 95%+ faithfulness score

**Answer Relevance:**
- **Definition:** Does answer address the user's question?
- **Test:** Semantic similarity between question and answer
- **Target:** >0.7 similarity

**Context Utilization:**
- **Definition:** Does LLM use all relevant chunks provided?
- **Monitor:** Are some chunks consistently ignored?
- **Action:** Adjust ranking or chunk size if underutilized

### Negative Test Suite

**Out-of-Scope Questions:**
```typescript
const negativeTests = [
  {
    query: "What is the weather today?",
    expected: "refusal (out of scope)"
  },
  {
    query: "Who won the 2024 election?",
    expected: "refusal (not in panel)"
  },
  {
    query: "Tell me a joke",
    expected: "refusal or polite redirect"
  }
]
```

**PII Tests:**
```typescript
const piiTests = [
  {
    query: "My email is john@example.com",
    expected: "blocked by Presidio"
  },
  {
    query: "Call me at +48 123 456 789",
    expected: "blocked by Presidio"
  }
]
```

**Regression Tests:**
```typescript
const regressionTests = [
  {
    query: "What did the first speaker say about AI regulation?",
    expected: "Contains timestamp, speaker name, and accurate summary"
  }
]
```

### Monitoring Dashboards

**Langfuse Metrics:**
- Total queries per day
- Average response time (target: <3 seconds)
- Error rate (target: <5%)
- PII detection rate
- Top queries (user intent analysis)
- Cost per query (OpenAI API usage)

**Qdrant Metrics:**
- Collection size (number of chunks)
- Query latency (target: <200ms)
- Disk usage
- Memory consumption

---

## 9. Observability & Telemetry

### OpenTelemetry Integration

**Tracing with Langfuse:**
```
Trace: User Query "What did Speaker A say?"
├─ Span: PII Detection (120ms)
│  ├─ Input: "[REDACTED]" (not logged if PII)
│  └─ Output: { piiDetected: false }
├─ Span: Generate Query Embedding (450ms)
│  ├─ Model: text-embedding-3-large
│  ├─ Cost: $0.00013
│  └─ Dimensions: 3072
├─ Span: Qdrant Search (85ms)
│  ├─ Filters: { title: "AI Panel" }
│  ├─ Top-K: 8
│  └─ Results: [{ score: 0.78, id: "chunk_42" }, ...]
├─ Span: LLM Generation (2.3s)
│  ├─ Model: gpt-5-mini
│  ├─ Reasoning Effort: medium
│  ├─ Tokens: 1200 input, 350 output
│  ├─ Cost: $0.0042
│  └─ Latency: 2300ms
└─ Total: 2.955s, $0.00433
```

**Key Metrics Tracked:**

1. **Latency Breakdown:**
   - PII check: ~100-200ms
   - Embedding: ~400-600ms
   - Vector search: <100ms
   - LLM generation: 2-4s (depends on response length)
   - **Total:** ~3-5s end-to-end

2. **Cost Tracking:**
   - Embedding: $0.00013 per query (text-embedding-3-large)
   - LLM: ~$0.004 per query (gpt-5-mini, medium reasoning)
   - **Monthly estimate:** $50-100 for 1000 queries

3. **Error Monitoring:**
   - PII service down → logged but doesn't block request (fail-open)
   - Qdrant connection error → HTTP 503 returned
   - OpenAI API error → retry 2x, then fail gracefully
   - All errors traced with request ID

4. **Usage Patterns:**
   - Top 10 queries
   - Most queried lectures
   - Average session length
   - Peak usage times

### Logging Strategy

**Console Logs (Development):**
```
[2026-01-25 10:30:15] POST /api/chat | Request ID: abc123
[2026-01-25 10:30:15] PII check: PASSED (120ms)
[2026-01-25 10:30:15] Lecture selection: "AI Panel"
[2026-01-25 10:30:16] Qdrant search: 8 results (85ms, top score: 0.78)
[2026-01-25 10:30:18] LLM response: streaming started
[2026-01-25 10:30:21] Request completed (2955ms, $0.00433)
```

**Langfuse Dashboard:**
- Session replay (reconstruct full conversation)
- User feedback tracking (thumbs up/down)
- A/B test support (compare chunking strategies)
- Cost attribution (per team, per lecture)

**Alerts (Future):**
- Error rate >10% in 5 minutes
- Latency >10s for 3 consecutive requests
- PII detection rate spike (potential attack)
- Daily cost >$20 (budget protection)

---

## 10. Data Governance

### Content Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  1. CREATION                                                 │
│  → YouTube video published (panel discussion)               │
│  → Metadata: Title, URL, upload date                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. INGESTION                                                │
│  → Admin runs CLI: `bun run cli`                            │
│  → Transcription provider: AssemblyAI or Whisper            │
│  → Speaker diarization: Automatic                           │
│  → Quality check: Manual review of transcript               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. TRANSFORMATION                                           │
│  → Chunking strategy: Token-based (400) or Speaker-based   │
│  → Embedding model: text-embedding-3-large (3072-dim)      │
│  → Metadata enrichment: Speaker names, timestamps          │
│  → Validation: Chunk count, embedding dimensions           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. STORAGE                                                  │
│  → Vector DB: Qdrant collection "transcripts"              │
│  → Versioning: ingestedAt timestamp                        │
│  → Backup: Daily snapshot of Qdrant volume                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5. ACCESS                                                   │
│  → Users query via Web UI or Voice Assistant               │
│  → Rate limiting: 10 queries/minute per user (future)      │
│  → Audit log: All queries traced in Langfuse               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  6. RETENTION & DELETION                                     │
│  → Retention policy: 2 years for compliance recordings     │
│  → Deletion: CLI command removes all chunks for dataset    │
│  → Audit: Deletion logged with timestamp and operator      │
└─────────────────────────────────────────────────────────────┘
```

### Ownership & Permissions

**Who Can Ingest:**
- **Current:** CLI tool requires file system access (admin only)
- **Future:** Web UI with SSO authentication
- **Approval Workflow:** Manager approves public lectures, legal reviews sensitive content

**Who Can Query:**
- **Current:** Anyone with Web UI access (no auth)
- **Future:** Active Directory integration, team-based access control

**Who Can Delete:**
- **Current:** CLI admin with Qdrant credentials
- **Future:** Require 2-person approval for deletion (compliance officer + data owner)

### Content Versioning

**Dataset ID Strategy:**
```
datasetId: "yt-{videoId}"
example: "yt-Ya5Cg9qRspg"
```

**Version Tracking:**
```json
{
  "ingestedAt": "2026-01-25T10:30:00Z",
  "version": "1.0",
  "transcriptionProvider": "assemblyai",
  "chunkingStrategy": "speaker-based",
  "embeddingModel": "text-embedding-3-large"
}
```

**Re-Ingestion Policy:**
- If transcript updated (e.g., speaker names corrected), re-ingest with confirmation
- Old chunks deleted, new chunks inserted with new `ingestedAt` timestamp
- Notify active users of updates

### Quality Gates

**Pre-Ingestion Checklist:**
- [ ] Video is public or permission obtained
- [ ] Speakers identified and consent obtained (if required)
- [ ] Transcript reviewed for accuracy (spot-check)
- [ ] Title and metadata complete
- [ ] No sensitive/confidential information

**Post-Ingestion Validation:**
- [ ] Chunk count matches expected (e.g., 2hr video → ~300 chunks)
- [ ] All speakers have names (not just "Speaker A")
- [ ] Sample queries return relevant results
- [ ] No duplicate datasets

---

## 11. Scalability & Extensibility

### Multiple Recordings Support

**Current Implementation:**
- Single Qdrant collection: "transcripts"
- Filters by `title` or `datasetId` to separate lectures
- User selects lecture at start of conversation

**Scalability Patterns:**

1. **Dataset Isolation:**
   ```typescript
   // All chunks for one lecture tagged with same datasetId
   datasetId: "yt-Ya5Cg9qRspg"

   // Search filters automatically
   filter: { datasetId: { $eq: selectedDatasetId } }
   ```

2. **Namespace Strategy (Future):**
   ```typescript
   // Separate Qdrant collections per team
   collection: "transcripts-regulatory-affairs"
   collection: "transcripts-r&d"
   collection: "transcripts-sales"
   ```

3. **Multi-Tenancy (Enterprise):**
   ```typescript
   // Add tenant ID to all chunks
   metadata: {
     tenantId: "neuca-poland",
     departmentId: "regulatory",
     accessLevel: "internal"
   }
   ```

### Horizontal Scaling

**Vector Database (Qdrant):**
- Current: Single Docker container
- Scale: Qdrant cluster with replication (3+ nodes)
- Capacity: Millions of chunks, TB-scale

**API Backend:**
- Current: Single Hono instance
- Scale: Load balancer + multiple API containers
- Stateless design: No sticky sessions needed

**Embedding Generation:**
- Current: OpenAI API (rate limited)
- Scale: Batch processing queue (e.g., BullMQ)
- Alternative: Self-hosted embedding models (sentence-transformers)

### Content Type Extensions

**Beyond YouTube:**
```typescript
sourceType: 'youtube' | 'file' | 'url' | 'podcast' | 'teams-meeting'

// Teams meeting example
{
  sourceType: 'teams-meeting',
  sourceUrl: 'https://teams.microsoft.com/...',
  recordingDate: '2026-01-20',
  attendees: ['alice@neuca.pl', 'bob@neuca.pl'],
  meetingId: 'mtg-abc123'
}
```

**Document Support (Future):**
- PDF whitepapers → Extract text → Chunk → Embed
- PowerPoint slides → OCR + speaker notes → Embed
- Word documents → Section-aware chunking

### Language Expansion

**Current:**
- Whisper: Multi-language transcription
- LLM: Polish responses (via system prompt)
- Presidio: English NER (universal patterns)

**Multi-Language Roadmap:**
```typescript
// Detect language from transcript
language: 'pl' | 'en' | 'de' | 'es'

// Use language-specific embedding models
embeddingModel: {
  'pl': 'text-embedding-3-large',  // Works for Polish
  'en': 'text-embedding-3-large',
  'multilingual': 'multilingual-e5-large'
}

// LLM responds in query language
systemPrompt: `Odpowiadaj w języku użytkownika. / Respond in user's language.`
```

### Analytics Extensions

**User Behavior Tracking:**
- Which topics are queried most?
- What timestamps are clicked?
- Session duration and engagement

**Content Gap Analysis:**
- Questions with no good answers → missing topics
- Low relevance scores → need better chunking
- High refusal rate → scope too narrow

**ROI Metrics:**
- Time saved: 2hr video avoided × queries answered
- User satisfaction: Thumbs up/down feedback
- Cost efficiency: $ per query vs. manual research cost

---

## 12. UX & User Trust

### Trust-Building Mechanisms

**1. Source Transparency**
```
User: "What did the panel say about AI regulation?"

Bot: "According to Prof. Jan Kowalski at [15:30], the panel discussed
      three key aspects of AI regulation..."

      [Click timestamp to watch source]
```
- Every claim linked to evidence
- Video modal auto-seeks to exact moment
- User can verify AI interpretation

**2. Reasoning Visibility**
```
[Show Reasoning] toggle
↓
"I searched for chunks about 'AI regulation' and found 5 relevant segments.
 The highest-scoring chunk (0.82) was from Prof. Kowalski's opening remarks.
 I combined insights from chunks #12, #15, and #18 to form this answer."
```
- Optional transparency for power users
- Builds confidence in AI's process
- Educational for understanding RAG

**3. Confidence Indicators**
```
High confidence: "According to [Speaker]..."
Medium: "Based on the discussion..."
Low: "The panel briefly mentioned..."
No context: "I don't have information about that in the available recordings."
```

**4. Error Recovery**
```
User: "What did John say?"
Bot: "Przepraszam, nie znalazłem mówcy o imieniu John. Czy miałeś na myśli
      jednego z panelistów: Prof. Jan Kowalski, Dr. Anna Nowak, Marek Wiśniewski?"
```
- Helpful error messages
- Suggests alternatives
- Guides user to success

### Adoption Strategy

**Onboarding Flow:**
1. **Welcome Screen:** "Ask me anything about the AI panel discussion"
2. **Suggestion Chips:** Pre-written sample questions
3. **First Query:** Gentle guidance if no results
4. **Timestamp Click:** Tutorial tooltip on first source link
5. **Feedback Loop:** "Was this helpful?" after each answer

**Sample Questions (Reduce Barrier to Entry):**
- "Co to jest AI Act?"
- "Jakie wyzwania omawiano?"
- "Kto mówił o regulacjach?"

**Progressive Disclosure:**
- Basic: Simple chat interface
- Intermediate: Lecture selection, timestamp navigation
- Advanced: Reasoning toggle, voice assistant, multi-lecture comparison

### User Feedback Collection

**In-Chat Feedback:**
```
[Thumbs Up] [Thumbs Down] after each answer
↓
Thumbs Down → "What went wrong?"
- [ ] Answer was incorrect
- [ ] Source not relevant
- [ ] Missing information
- [ ] Other: _______
```

**Langfuse Score Tracking:**
```typescript
await langfuse.score({
  traceId: requestId,
  name: 'user-feedback',
  value: isThumbsUp ? 1 : 0,
  comment: userComment
})
```

**Iteration Loop:**
1. Collect feedback weekly
2. Identify low-scoring queries
3. Analyze root cause (chunking? retrieval? LLM?)
4. Adjust parameters (threshold, chunk size, prompt)
5. Regression test
6. Deploy improvement

---

## 13. Pilot Plan & Success Criteria

### Rollout Phases

**Phase 1: Internal Alpha (Week 1-2)**
- **Audience:** 5 team members (tech-savvy)
- **Content:** Single panel discussion (Ya5Cg9qRspg)
- **Focus:** Functional testing, bug fixing
- **Success:** Zero critical bugs, 80% query success rate

**Phase 2: Beta (Week 3-4)**
- **Audience:** 20 users (regulatory affairs + R&D)
- **Content:** Add 2 more recordings (different topics)
- **Focus:** UX refinement, performance tuning
- **Success:** <3s average response time, 90% positive feedback

**Phase 3: Limited Production (Month 2)**
- **Audience:** 50 users (cross-departmental)
- **Content:** 10 recordings (past 6 months)
- **Focus:** Scalability, governance, compliance audit
- **Success:** 100 queries/day, <5% error rate, compliance sign-off

**Phase 4: General Availability (Month 3+)**
- **Audience:** All employees (opt-in)
- **Content:** Continuous ingestion pipeline
- **Focus:** Adoption metrics, ROI tracking
- **Success:** 500 queries/week, 85% user satisfaction, measurable time savings

### Key Performance Indicators (KPIs)

**Technical KPIs:**
| Metric | Target | Measurement |
|--------|--------|-------------|
| Response Time | <3s (p95) | Langfuse latency traces |
| Availability | >99% uptime | Health check monitoring |
| Error Rate | <5% | Failed requests / total requests |
| Recall@8 | >80% | Manual evaluation on test set |
| Cost per Query | <$0.01 | OpenAI API usage tracking |

**Business KPIs:**
| Metric | Target | Measurement |
|--------|--------|-------------|
| Time Saved | 30min/week per user | User survey |
| Adoption Rate | 60% MAU | Unique users per month |
| User Satisfaction | >4/5 stars | Post-query rating |
| Query Success Rate | >85% | Thumbs up % |
| Repeat Usage | 3+ sessions/user/month | Session analytics |

**Compliance KPIs:**
| Metric | Target | Measurement |
|--------|--------|-------------|
| PII Block Rate | 100% | Presidio detection logs |
| Source Citation Rate | >95% | Answers with timestamps |
| Audit Trail Completeness | 100% | All queries logged |
| Data Deletion SLA | <24hr | Request to completion time |

### Risk Mitigation

**Technical Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI API outage | Medium | High | Fallback to cached responses, retry logic |
| Qdrant data loss | Low | Critical | Daily backups, replication in prod |
| PII leakage | Low | Critical | Presidio + manual audits, encryption at rest |
| Poor answer quality | Medium | Medium | Confidence thresholds, human review loop |

**Business Risks:**
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low adoption | Medium | Medium | Onboarding program, sample questions, training |
| Trust issues | Medium | High | Timestamp verification, transparent reasoning |
| Content ownership disputes | Low | Medium | Clear ingestion approval workflow |
| Regulatory non-compliance | Low | Critical | AI Act assessment, legal review, audit trail |

### Success Criteria

**Go/No-Go Decision (End of Phase 3):**

✅ **Proceed to General Availability if:**
- [ ] 90% of beta users rate as "helpful" or "very helpful"
- [ ] <5% error rate sustained over 2 weeks
- [ ] Compliance officer approves data governance
- [ ] Cost per query <$0.015 (within budget)
- [ ] Zero critical security incidents

❌ **Pause/Pivot if:**
- [ ] >20% of queries return "no information found" (scope too narrow)
- [ ] Users report hallucinations (refusal mode not working)
- [ ] Latency >5s consistently (performance issue)
- [ ] Cost >$0.05/query (not economically viable)

### Post-Launch Roadmap

**Month 4-6:**
- Expand to 50+ recordings
- Add voice assistant to homepage
- Implement user authentication
- Build admin dashboard for content management

**Month 7-12:**
- Multi-language support (English + Polish)
- Slack/Teams integration
- Advanced analytics (topic clustering, trend analysis)
- Self-service ingestion (web UI upload)

**Year 2:**
- Enterprise features (multi-tenancy, SSO, RBAC)
- Regulatory module (auto-tag compliance topics)
- PDF/document support
- Fine-tuned embedding models for pharma domain

---

## 14. "One More Thing" - Voice Interface

### Voice Assistant Overview

**What It Is:**
- Polish-language voice conversation interface
- Same RAG backend as text chat
- ElevenLabs ConvAI widget integration
- Accessible from homepage: "Voice Assistant" button

**Why Voice:**
- **Accessibility:** Hands-free for busy professionals
- **Naturalness:** Speak questions instead of typing
- **Speed:** Faster than typing for complex queries
- **Engagement:** More conversational, less intimidating

### Technical Implementation

**Frontend:**
```typescript
// ElevenLabs widget embedded in /voice page
agentId: "agent_8301kfth6cgwfmxvqv3dyhsarxwv"
language: "pl" (Polish)
voiceId: Custom Polish voice
```

**Backend (Same as Text Chat):**
- User speaks → ElevenLabs STT (Speech-to-Text)
- Text query → API `/api/chat` endpoint
- RAG pipeline retrieves context
- GPT-5-mini generates answer
- ElevenLabs TTS (Text-to-Speech) → User hears response

**Key Behaviors:**
- Speaks timestamps: "Według profesora Kowalskiego przy piętnaście minut trzydzieści sekund..."
- Can spell out technical terms
- Handles interruptions gracefully
- Same refusal mode as text chat

### UX Considerations

**Voice-Specific Design:**
- Shorter answers (avoid 5-minute monologues)
- Repeat option: "Czy chcesz, żebym powtórzył?"
- Clarification questions: "Czy miałeś na myśli panel z marca czy czerwca?"

**Limitations:**
- No visual timestamp links (voice-only)
- Harder to verify sources (must remember timestamp)
- Background noise may affect accuracy

**Hybrid Approach:**
- Start with voice for quick questions
- Switch to text chat for detailed research
- Voice reads timestamp, user clicks in text chat to watch

---

## Conclusion: Why This Solution Stands Out

### Business Value Recap

1. **ROI:** Transforms 2-hour videos into 30-second knowledge retrieval
2. **Compliance:** Built-in audit trail, PII protection, AI Act alignment
3. **Trust:** Evidence-first architecture with source verification
4. **Scalability:** Handles 10, 100, or 1000 recordings with same architecture
5. **User Experience:** Multi-modal (text, voice), intuitive, transparent

### Technical Excellence

- **Production-Ready:** Docker deployment, observability, error handling
- **Extensible:** Modular design allows easy feature additions
- **Secure:** PII detection, encryption, access controls (future)
- **Observable:** Full tracing, cost tracking, quality metrics
- **Tested:** Negative tests, regression suite, quality gates

### Differentiators

- ✅ Speaker-aware chunking (preserves conversation context)
- ✅ Timestamp linking (click to verify in video)
- ✅ Multi-provider transcription (cloud + local)
- ✅ Reasoning transparency (see AI's thought process)
- ✅ Polish-native personality (Neucacz character)
- ✅ Voice interface (accessibility + engagement)
- ✅ Compliance-by-design (AI Act, GDPR, audit trail)

### Next Steps

1. **Demo:** Show live system answering questions about AI panel
2. **Deep Dive:** Walk through RAG pipeline with Langfuse traces
3. **Roadmap Discussion:** Prioritize features for pilot
4. **Pilot Planning:** Select users, content, and success metrics
5. **Compliance Review:** Legal sign-off on data governance

---

## Appendix: Demo Script

**Suggested Presentation Flow (30 min):**

1. **Intro (2 min):** Problem statement + business value
2. **Architecture (5 min):** Data flow diagram walkthrough
3. **Live Demo (10 min):**
   - Show homepage → sample question
   - Click timestamp → video verification
   - Toggle reasoning → transparency
   - Voice assistant → accessibility
   - PII test → security
4. **Technical Deep Dive (8 min):**
   - Langfuse trace of a query
   - Chunking strategy comparison
   - Observability dashboard
5. **Compliance & Governance (3 min):** AI Act, PII, audit trail
6. **Q&A (2 min):** Address concerns

**Demo Questions (Pre-prepared):**
1. "Co to jest AI Act?" → Tests basic retrieval
2. "Kto mówił o wyzwaniach regulacyjnych?" → Tests speaker attribution
3. "Podsumuj cały panel w 3 punktach" → Tests summarization
4. "What is the capital of France?" → Tests refusal mode (out of scope)
5. "My email is test@example.com" → Tests PII blocking

---

**Document Version:** 1.0
**Last Updated:** 2026-01-25
**Author:** Neuca Development Team
**Prepared for:** Recruitment Presentation
