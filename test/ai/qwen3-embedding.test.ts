import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  __setEmbedTransportForTests,
  configureGateway,
  embed,
  embedQuery,
  resetGateway,
  withBudgetTracker,
} from '../../src/core/ai/gateway.ts';
import { BudgetTracker } from '../../src/core/budget/budget-tracker.ts';
import { withAIInvocationGuard } from '../../src/core/ai/invocation-guard.ts';
import {
  OLLAMA_QWEN3_QUERY_PREFIX,
  isOllamaQwen3Embedding06B,
  prepareOllamaQwen3EmbeddingInput,
} from '../../src/core/ai/qwen3-embedding.ts';

afterEach(() => {
  __setEmbedTransportForTests(null);
  resetGateway();
});

function configureQwen3(): void {
  configureGateway({
    embedding_model: 'ollama:qwen3-embedding:0.6b',
    embedding_dimensions: 768,
    env: {},
  });
}

function vector768(): number[] {
  return new Array(768).fill(0.25);
}

function vector1024(): number[] {
  return new Array(1024).fill(0.25);
}

describe('Ollama Qwen3 exact model policy', () => {
  test('matches only the exact Ollama model', () => {
    expect(isOllamaQwen3Embedding06B('ollama', 'qwen3-embedding:0.6b')).toBe(true);
    expect(isOllamaQwen3Embedding06B('ollama', 'qwen3-embedding:4b')).toBe(false);
    expect(isOllamaQwen3Embedding06B('openrouter', 'qwen3-embedding:0.6b')).toBe(false);
  });

  test('prefixes only query input and preserves document bytes exactly', () => {
    const document = '界'.repeat(4000) + '\u0000\nend';
    expect(prepareOllamaQwen3EmbeddingInput(document, 'document')).toBe(document);
    expect(prepareOllamaQwen3EmbeddingInput('weather tomorrow', 'query'))
      .toBe(`${OLLAMA_QWEN3_QUERY_PREFIX}weather tomorrow`);
  });
});

describe('gateway integration', () => {
  // Existing tests cover Qwen transport and chat reservation identity separately.
  // This protects embedding admission/settlement over the actual Qwen payload:
  // truncation, raw-query estimates, or a lost reservation id must fail it.
  // It uses existing transport/guard seams and a temporary budget audit only.
  test('plans and meters full Qwen inputs and settles each reservation by id', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'gbrain-qwen-budget-'));
    try {
      for (const inputType of ['document', 'query'] as const) {
        configureGateway({
          embedding_model: 'ollama:qwen3-embedding:0.6b',
          embedding_dimensions: 768,
          env: { GBRAIN_EMBED_MAX_BATCH_TOKENS: '5400' },
        });
        const texts = ['界'.repeat(9000), 'd'.repeat(9000)];
        const transported = texts.map(t => inputType === 'query' ? `${OLLAMA_QWEN3_QUERY_PREFIX}${t}` : t);
        const estimatedTokens = Math.ceil(transported.reduce((sum, t) => sum + t.length, 0) / 4);
        const auditPath = join(scratch, `${inputType}.jsonl`);
        const tracker = new BudgetTracker({
          label: 'test.qwen', auditPath, maxCostUsd: 0.01,
          // Nonzero fixture pricing makes a leaked hold block the second call.
          pricingOverrides: { 'ollama:qwen3-embedding:0.6b': { input: 1, output: 0 } },
        });
        const batches: string[][] = [];
        const guardCeilings: Array<number | undefined> = [];
        __setEmbedTransportForTests((async ({ values }: any) => {
          batches.push([...values]);
          return { embeddings: values.map(() => vector768()) }; // no usage: exercise fallback estimate
        }) as any);

        await withBudgetTracker(tracker, () => withAIInvocationGuard(async call => {
          guardCeilings.push(call.maxInputTokens);
          return { settle: async () => {} };
        }, async () => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const vectors = await embed(texts, { inputType });
            expect(vectors.map(v => v.length)).toEqual([768, 768]);
          }
        }));

        expect(batches).toEqual([...transported, ...transported].map(t => [t]));
        expect(guardCeilings).toEqual([...transported, ...transported].map(t => Buffer.byteLength(t, 'utf8')));
        expect(tracker.totalSpent).toBeCloseTo(2 * estimatedTokens / 1_000_000, 12);
        expect(tracker.snapshot().callsRecorded).toBe(2);
        const audit = readFileSync(auditPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        expect(audit.map(row => row.event)).toEqual(['reserve', 'record', 'reserve', 'record']);
        for (const i of [0, 2]) {
          expect(audit[i].reservation).toBeString();
          expect(audit[i + 1].reservation).toBe(audit[i].reservation);
          expect(audit[i].projected_cost_usd).toBeCloseTo(estimatedTokens / 1_000_000, 12);
          expect(audit[i + 1].input_tokens).toBe(estimatedTokens);
          expect(audit[i + 1].embedding_dims).toBe(768);
        }
        expect(audit[0].reservation).not.toBe(audit[2].reservation);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test('does not client-truncate Qwen3 document input', async () => {
    configureQwen3();
    let valuesSeen: string[] = [];
    __setEmbedTransportForTests((async ({ values }: any) => {
      valuesSeen = [...values];
      return { embeddings: values.map(() => vector768()) };
    }) as any);

    const document = 'd'.repeat(9000);
    const [vector] = await embed([document]);

    expect(valuesSeen).toEqual([document]);
    expect(vector.length).toBe(768);
  });

  test('adds the exact prefix to Qwen3 query input', async () => {
    configureQwen3();
    let valuesSeen: string[] = [];
    __setEmbedTransportForTests((async ({ values }: any) => {
      valuesSeen = [...values];
      return { embeddings: values.map(() => vector768()) };
    }) as any);

    await embedQuery('web search query');

    expect(valuesSeen).toEqual([`${OLLAMA_QWEN3_QUERY_PREFIX}web search query`]);
  });

  test('does not client-project a mismatched provider response', async () => {
    configureQwen3();
    __setEmbedTransportForTests((async () => ({ embeddings: [vector1024()] })) as any);

    await expect(embed(['document'])).rejects.toThrow('returned 1024 but schema expects 768');
  });

  test('keeps non-Qwen client truncation behavior', async () => {
    configureGateway({ embedding_model: 'ollama:nomic-embed-text', embedding_dimensions: 768, env: {} });
    let valuesSeen: string[] = [];
    __setEmbedTransportForTests((async ({ values }: any) => {
      valuesSeen = [...values];
      return { embeddings: values.map(() => vector768()) };
    }) as any);

    const document = 'd'.repeat(9000);
    await embed([document]);

    expect(valuesSeen).toEqual(['d'.repeat(8000)]);
  });
});
