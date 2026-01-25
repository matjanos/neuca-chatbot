# Neuca Chatbot - Architecture Diagrams

This file contains Mermaid diagrams for the presentation. You can render these in GitHub, VS Code with Mermaid extension, or convert to images using tools like https://mermaid.live

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Data Ingestion (CLI)"
        A[YouTube URL] --> B[yt-dlp<br/>Audio Download]
        B --> C[Transcription<br/>AssemblyAI/Whisper]
        C --> D[Speaker Diarization]
        D --> E[Smart Chunking<br/>Speaker-aware/Token-based]
        E --> F[OpenAI Embeddings<br/>3072-dim vectors]
        F --> G[(Qdrant<br/>Vector Database)]
    end

    subgraph "Query Pipeline (API)"
        H[User Query] --> I{PII Detection<br/>Presidio}
        I -->|Blocked| J[Error: PII Detected]
        I -->|Passed| K[Generate Query<br/>Embedding]
        K --> L[Semantic Search<br/>Qdrant]
        L --> M[Retrieve Top 8<br/>Relevant Chunks]
        M --> N[Build RAG Context<br/>with Sources]
        N --> O[GPT-5-mini<br/>Generate Answer]
        O --> P[Stream Response<br/>with Citations]
    end

    subgraph "User Interfaces"
        Q[Web Chat UI]
        R[Voice Assistant<br/>ElevenLabs]
        S[Admin CLI]
    end

    subgraph "Observability"
        T[Langfuse Traces]
        U[OpenTelemetry]
        V[Cost Tracking]
    end

    G -.->|Read| L
    P --> Q
    P --> R
    O -.->|Trace| T
    I -.->|Log| U
    K -.->|Cost| V

    style I fill:#ff6b6b
    style G fill:#4ecdc4
    style O fill:#95e1d3
    style T fill:#ffeaa7
```

---

## 2. Data Flow: Ingestion to Knowledge

```mermaid
flowchart LR
    A[YouTube Video<br/>2 hours] --> B[Audio MP3<br/>120 MB]
    B --> C[Transcript<br/>15,000 words]
    C --> D[Segments<br/>500 utterances]
    D --> E{Chunking Strategy}

    E -->|Token-based| F[~300 chunks<br/>400 tokens each<br/>20% overlap]
    E -->|Speaker-based| G[~120 chunks<br/>conversation turns<br/>preserve context]

    F --> H[Embeddings<br/>3072-dim vectors]
    G --> H

    H --> I[(Qdrant Collection<br/>'transcripts')]

    I --> J[Payload<br/>• text<br/>• speaker<br/>• timestamps<br/>• videoId]

    style E fill:#fab1a0
    style I fill:#74b9ff
    style J fill:#a29bfe
```

---

## 3. RAG Pipeline: Query to Answer

```mermaid
sequenceDiagram
    participant User
    participant WebUI
    participant API
    participant Presidio
    participant OpenAI
    participant Qdrant
    participant Langfuse

    User->>WebUI: "Co powiedział pierwszy mówca?"
    WebUI->>API: POST /api/chat

    API->>Langfuse: Start trace
    API->>Presidio: Check for PII
    Presidio-->>API: No PII detected

    API->>OpenAI: Generate query embedding
    OpenAI-->>API: [0.123, -0.456, ..., 0.789]

    API->>Qdrant: Semantic search<br/>topK=8, threshold=0.3
    Qdrant-->>API: 8 chunks with scores

    Note over API: Build context:<br/>[1] Speaker A [00:12]<br/>[2] Speaker B [01:30]<br/>...

    API->>OpenAI: Generate answer<br/>+ RAG context
    OpenAI-->>API: Stream response

    loop Streaming
        API->>WebUI: Partial text
        WebUI->>User: Update UI
    end

    API->>Langfuse: End trace<br/>(latency, cost, scores)

    WebUI->>User: "Według [Speaker A] w [00:12]..."
```

---

## 4. Trust & Compliance Framework

```mermaid
mindmap
    root((Trust & Compliance))
        Transparency
            Source Citations
            Timestamp Links
            Reasoning Visibility
            "Click to Verify"
        Security
            PII Detection
            Data Encryption
            Access Control
            Audit Logs
        Quality
            Evidence-First RAG
            Confidence Thresholds
            Refusal Mode
            No Hallucination
        Compliance
            AI Act Alignment
            GDPR Compatible
            Data Retention Policy
            Right to Deletion
        Observability
            Full Tracing
            Cost Tracking
            Error Monitoring
            Performance Metrics
        Governance
            Data Ownership
            Approval Workflow
            Version Control
            Change Management
```

---

## 5. Content Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: YouTube video published
    Created --> Ingested: Admin runs CLI

    state Ingested {
        [*] --> Transcribed
        Transcribed --> Diarized
        Diarized --> Chunked
        Chunked --> Embedded
        Embedded --> Stored
    }

    Stored --> Active: Available for queries

    state Active {
        [*] --> Searchable
        Searchable --> Retrieved: User query
        Retrieved --> Cited: Answer generated
        Cited --> Verified: User clicks timestamp
    }

    Active --> Updated: Content correction
    Updated --> Ingested: Re-process

    Active --> Archived: Retention policy
    Archived --> Deleted: Compliance request
    Deleted --> [*]

    note right of Ingested
        Metadata tracked:
        - ingestedAt timestamp
        - version number
        - transcription provider
    end note

    note right of Active
        User interactions:
        - Query logs
        - Feedback scores
        - Source clicks
    end note
```

---

## 6. Scalability Architecture

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Nginx/HAProxy]
    end

    subgraph "API Layer (Stateless)"
        API1[API Instance 1]
        API2[API Instance 2]
        API3[API Instance 3]
    end

    subgraph "Vector Database (Qdrant Cluster)"
        Q1[(Qdrant Node 1<br/>Primary)]
        Q2[(Qdrant Node 2<br/>Replica)]
        Q3[(Qdrant Node 3<br/>Replica)]
    end

    subgraph "External Services"
        OAI[OpenAI API<br/>Embeddings + LLM]
        PRES[Presidio<br/>PII Detection]
        LF[Langfuse<br/>Observability]
    end

    subgraph "Ingestion Queue"
        RQ[Redis Queue]
        W1[Worker 1]
        W2[Worker 2]
    end

    LB --> API1
    LB --> API2
    LB --> API3

    API1 --> Q1
    API2 --> Q1
    API3 --> Q1

    Q1 -.->|Replicate| Q2
    Q1 -.->|Replicate| Q3

    API1 --> OAI
    API2 --> OAI
    API3 --> OAI

    API1 --> PRES
    API2 --> PRES

    API1 -.->|Trace| LF
    API2 -.->|Trace| LF
    API3 -.->|Trace| LF

    RQ --> W1
    RQ --> W2
    W1 --> Q1
    W2 --> Q1

    style LB fill:#fdcb6e
    style Q1 fill:#0984e3
    style Q2 fill:#74b9ff
    style Q3 fill:#74b9ff
    style OAI fill:#00b894
    style LF fill:#ffeaa7
```

---

## 7. Security Layers

```mermaid
graph LR
    A[User Input] --> B{Layer 1:<br/>PII Detection}
    B -->|PII Found| C[Block Request<br/>Log Metadata]
    B -->|Clean| D{Layer 2:<br/>Input Validation}

    D -->|Invalid| E[400 Error<br/>Malformed Request]
    D -->|Valid| F{Layer 3:<br/>Rate Limiting}

    F -->|Exceeded| G[429 Error<br/>Too Many Requests]
    F -->|OK| H[Process Query]

    H --> I{Layer 4:<br/>Output Filtering}
    I -->|Contains PII| J[Redact Before Return]
    I -->|Clean| K[Return to User]

    C -.->|Audit Log| L[(Security DB)]
    E -.->|Audit Log| L
    G -.->|Audit Log| L
    J -.->|Audit Log| L

    style B fill:#ff6b6b
    style D fill:#feca57
    style F fill:#48dbfb
    style I fill:#ff9ff3
    style L fill:#1dd1a1
```

---

## 8. Observability Stack

```mermaid
graph TB
    subgraph "Application"
        API[API Service]
        WEB[Web Frontend]
    end

    subgraph "Instrumentation"
        OTEL[OpenTelemetry SDK]
    end

    subgraph "Collection"
        LF[Langfuse<br/>LLM Traces]
        LOGS[Console Logs<br/>Structured JSON]
    end

    subgraph "Analysis"
        DASH[Langfuse Dashboard]
        ALERTS[Alert Rules]
        COST[Cost Attribution]
    end

    subgraph "Metrics"
        M1[Latency<br/>p50, p95, p99]
        M2[Error Rate<br/>4xx, 5xx]
        M3[Token Usage<br/>Input/Output]
        M4[Retrieval Quality<br/>Scores, Recall]
    end

    API --> OTEL
    OTEL --> LF
    API --> LOGS

    LF --> DASH
    LF --> M1
    LF --> M2
    LF --> M3
    LF --> M4

    DASH --> ALERTS
    M3 --> COST

    ALERTS -.->|Slack/Email| N[On-Call Team]

    style OTEL fill:#ee5a6f
    style LF fill:#ffeaa7
    style DASH fill:#00b894
    style COST fill:#fd79a8
```

---

## 9. Multi-Lecture Architecture

```mermaid
graph TB
    subgraph "Single Qdrant Collection: 'transcripts'"
        A[Chunk 1<br/>datasetId: yt-ABC<br/>title: Panel AI<br/>speaker: A]
        B[Chunk 2<br/>datasetId: yt-ABC<br/>title: Panel AI<br/>speaker: B]
        C[Chunk 3<br/>datasetId: yt-XYZ<br/>title: Pharma Conf<br/>speaker: C]
        D[Chunk 4<br/>datasetId: yt-XYZ<br/>title: Pharma Conf<br/>speaker: D]
        E[Chunk 5<br/>datasetId: yt-123<br/>title: Training<br/>speaker: E]
    end

    Q[User Query:<br/>"Co mówił Speaker A?"]

    Q --> F{Lecture Selection}
    F -->|User picks:<br/>"Panel AI"| G[Filter:<br/>title = "Panel AI"]

    G --> H[Semantic Search]
    H --> I[Results:<br/>Chunk 1 score: 0.85<br/>Chunk 2 score: 0.72]

    style F fill:#fdcb6e
    style G fill:#e17055
    style H fill:#74b9ff
    style I fill:#00b894
```

---

## 10. Voice Assistant Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant ElevenLabs
    participant API
    participant Qdrant

    User->>Browser: Click "Voice Assistant"
    Browser->>ElevenLabs: Load ConvAI widget

    User->>ElevenLabs: 🎤 "Co to jest AI Act?"
    ElevenLabs->>ElevenLabs: Speech-to-Text

    ElevenLabs->>API: POST /api/chat<br/>{"messages": [{"role": "user", "content": "Co to jest AI Act?"}]}

    API->>Qdrant: Search for "AI Act"
    Qdrant-->>API: Relevant chunks

    API->>API: Generate answer
    API-->>ElevenLabs: Stream text response

    ElevenLabs->>ElevenLabs: Text-to-Speech<br/>(Polish voice)
    ElevenLabs->>User: 🔊 "AI Act to..."

    Note over User,ElevenLabs: User can interrupt<br/>and ask follow-up
```

---

## 11. Pilot Rollout Phases

```mermaid
gantt
    title Pilot Rollout Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1: Alpha
    5 users, 1 lecture        :a1, 2026-02-01, 14d
    Bug fixing                :a2, 2026-02-01, 14d
    section Phase 2: Beta
    20 users, 3 lectures      :b1, 2026-02-15, 14d
    UX refinement             :b2, 2026-02-15, 14d
    section Phase 3: Limited Prod
    50 users, 10 lectures     :c1, 2026-03-01, 30d
    Compliance audit          :c2, 2026-03-15, 15d
    Go/No-Go decision         :milestone, c3, 2026-03-31, 1d
    section Phase 4: GA
    All employees             :d1, 2026-04-01, 90d
    Continuous improvement    :d2, 2026-04-01, 90d
```

---

## 12. Decision Flow: Hallucination Prevention

```mermaid
flowchart TD
    A[User Query] --> B[Generate Embedding]
    B --> C[Search Qdrant]
    C --> D{Top Score >= 0.3?}

    D -->|No| E[No Relevant Context Found]
    E --> F["Response: 'Nie mam informacji<br/>o tym w dostępnych nagraniach'"]

    D -->|Yes| G[Retrieve Top 8 Chunks]
    G --> H{Chunks Contain<br/>Answer?}

    H -->|Uncertain| I["LLM Check:<br/>'Can you answer<br/>this question?'"]
    I -->|No| E
    I -->|Yes| J[Build RAG Context]

    H -->|Yes| J
    J --> K[System Prompt:<br/>'Answer ONLY from context']
    K --> L[Generate Answer]
    L --> M{Post-Generation<br/>Validation}

    M -->|No Citations| N[Force Regeneration<br/>with Citations]
    M -->|Has Citations| O[Stream to User]

    N --> L

    style E fill:#ff6b6b
    style F fill:#ff6b6b
    style D fill:#feca57
    style M fill:#48dbfb
    style O fill:#1dd1a1
```

---

## 13. Cost Breakdown per Query

```mermaid
pie title Cost per Query ($0.00433 average)
    "LLM Generation (GPT-5-mini)" : 0.0042
    "Query Embedding (3072-dim)" : 0.00013
    "Qdrant Search (negligible)" : 0.00000
```

---

## 14. User Journey Map

```mermaid
journey
    title User Experience: From Question to Verified Answer
    section Discovery
      Land on homepage: 5: User
      Read welcome message: 4: User
      See sample questions: 5: User
    section First Query
      Click "Start Chat": 5: User
      Select lecture: 4: User
      Type question: 5: User
      Wait for response (3s): 3: User
    section Engagement
      Read answer: 5: User
      See timestamp citation: 5: User
      Click timestamp link: 5: User
      Watch video at exact moment: 5: User
    section Trust Building
      Verify AI answer against video: 5: User
      Give thumbs up: 5: User
      Ask follow-up question: 5: User
    section Mastery
      Toggle "Show Reasoning": 4: User
      Try voice assistant: 4: User
      Share with colleague: 5: User
```

---

## 15. AI Act Compliance Checklist

```mermaid
graph LR
    subgraph "Transparency (Art. 52)"
        A1[✅ Users informed<br/>interacting with AI]
        A2[✅ System capabilities<br/>clearly explained]
        A3[✅ Limitations disclosed]
    end

    subgraph "Human Oversight (Art. 14)"
        B1[✅ Timestamp verification<br/>available]
        B2[✅ Admin controls<br/>via CLI]
        B3[✅ Query logs<br/>in Langfuse]
    end

    subgraph "Data Governance (Art. 10)"
        C1[✅ Training data<br/>traceable]
        C2[✅ Version control<br/>via Git]
        C3[✅ Deletion capability<br/>GDPR Art. 17]
    end

    subgraph "Accuracy (Art. 15)"
        D1[✅ Source attribution<br/>required]
        D2[✅ Confidence thresholds<br/>0.3 minimum]
        D3[✅ Refusal mode<br/>when uncertain]
    end

    subgraph "Documentation (Annex IV)"
        E1[✅ Technical docs<br/>CLAUDE.md]
        E2[✅ Risk assessment<br/>Minimal/Low]
        E3[✅ Change log<br/>TECHNICAL_LOG.md]
    end

    A1 & A2 & A3 --> F{Compliance<br/>Assessment}
    B1 & B2 & B3 --> F
    C1 & C2 & C3 --> F
    D1 & D2 & D3 --> F
    E1 & E2 & E3 --> F

    F --> G[✅ AI Act<br/>Compliant]

    style G fill:#00b894
    style F fill:#ffeaa7
```

---

## Notes for Presentation

### How to Use These Diagrams:

1. **Export as Images:**
   - Go to https://mermaid.live
   - Paste each diagram code
   - Export as PNG/SVG
   - Insert into PowerPoint/Keynote

2. **Interactive Demo:**
   - Show diagrams in VS Code with Mermaid extension
   - Live-edit during Q&A if needed

3. **Slide Recommendations:**
   - Diagram 1 (Architecture): Overview slide
   - Diagram 2 (Data Flow): Technical deep dive
   - Diagram 3 (RAG Pipeline): How it works
   - Diagram 4 (Trust Framework): Compliance slide
   - Diagram 7 (Security): Security features
   - Diagram 12 (Hallucination Prevention): Quality assurance
   - Diagram 15 (AI Act): Regulatory compliance

### Animation Tips:
- Reveal architecture diagram layer by layer
- Animate sequence diagram step-by-step
- Use build animations for mindmap branches
- Highlight decision points in flowcharts
