import { afterEach, describe, expect, test } from 'bun:test';
import {
  __setEmbedTransportForTests,
  configureGateway,
  embed,
  embedQuery,
  resetGateway,
} from '../../src/core/ai/gateway.ts';
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
