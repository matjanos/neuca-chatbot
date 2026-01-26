import { trace, SpanStatusCode } from '@opentelemetry/api';
import pino from 'pino';
import { PII_CONFIG } from '../config.js';

const tracer = trace.getTracer('presidio');
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}).child({ service: 'presidio' });

/** Entity detected by Presidio Analyzer */
export interface PresidioEntity {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

/** Result of PII analysis */
export interface PIIAnalysisResult {
  hasPII: boolean;
  entities: PresidioEntity[];
  durationMs: number;
}

/**
 * Analyze text for PII using Microsoft Presidio Analyzer
 * Fails open - if Presidio is unavailable, allows request to proceed
 */
export async function analyzePII(text: string): Promise<PIIAnalysisResult> {
  const startTime = Date.now();

  // Skip analysis if disabled
  if (!PII_CONFIG.enabled) {
    return { hasPII: false, entities: [], durationMs: 0 };
  }

  return tracer.startActiveSpan('pii.analyze', async (span) => {
    try {
      // Input: metadata only (never log actual text for privacy)
      const inputData = {
        text_length: text.length,
        language: PII_CONFIG.language,
        score_threshold: PII_CONFIG.scoreThreshold,
      };
      span.setAttribute('input.value', JSON.stringify(inputData));

      logger.debug({
        operation: 'pii.analyze.start',
        input: inputData,
      }, 'Starting PII analysis');

      const response = await fetch(`${PII_CONFIG.analyzerUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: PII_CONFIG.language,
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Presidio returned ${response.status}: ${response.statusText}`);
      }

      const entities: PresidioEntity[] = await response.json();
      const durationMs = Date.now() - startTime;

      // Filter by score threshold
      const filteredEntities = entities.filter(
        (e) => e.score >= PII_CONFIG.scoreThreshold
      );

      const hasPII = filteredEntities.length > 0;
      const entityTypes = [...new Set(filteredEntities.map((e) => e.entity_type))];

      // Output: only entity metadata, never actual PII values
      const outputData = {
        has_pii: hasPII,
        entity_count: filteredEntities.length,
        entity_types: entityTypes,
        duration_ms: durationMs,
      };
      span.setAttribute('output.value', JSON.stringify(outputData));

      logger.info({
        operation: 'pii.analyze.complete',
        durationMs,
        output: outputData,
      }, hasPII ? 'PII detected' : 'No PII detected');

      span.setStatus({ code: SpanStatusCode.OK });

      return { hasPII, entities: filteredEntities, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      logger.warn({
        operation: 'pii.analyze.failed',
        durationMs,
        error: { message: err.message, name: err.name },
      }, 'PII analysis failed (fail-open)');

      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });

      // Fail open - allow request to proceed if Presidio is unavailable
      return { hasPII: false, entities: [], durationMs };
    } finally {
      span.end();
    }
  });
}
