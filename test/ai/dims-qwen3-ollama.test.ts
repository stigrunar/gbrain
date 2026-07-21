import { describe, expect, test } from 'bun:test';
import { dimsProviderOptions } from '../../src/core/ai/dims.ts';
import { resolveSchemaEmbeddingDim } from '../../src/core/embedding-dim-check.ts';
import { getRecipe } from '../../src/core/ai/recipes/index.ts';

describe('Qwen3-Embedding on Ollama-compatible providers', () => {
  test('passes server-side dimensions and never emits input_type', () => {
    expect(dimsProviderOptions('openai-compatible', 'qwen3-embedding:0.6b', 768, 'query'))
      .toEqual({ openaiCompatible: { dimensions: 768 } });
  });

  test('keeps other Ollama models unchanged', () => {
    expect(dimsProviderOptions('openai-compatible', 'nomic-embed-text', 768)).toBeUndefined();
    expect(dimsProviderOptions('openai-compatible', 'mxbai-embed-large', 1024)).toBeUndefined();
  });
});

describe('Ollama recipe — Qwen3 dimensions', () => {
  test('recognizes qwen3-embedding:0.6b and allows 768', () => {
    const recipe = getRecipe('ollama');
    expect(recipe?.touchpoints.embedding?.models).toContain('qwen3-embedding:0.6b');
    expect(recipe?.touchpoints.embedding?.dims_options).toContain(768);

    const result = resolveSchemaEmbeddingDim({
      embedding_model: 'ollama:qwen3-embedding:0.6b',
      embedding_dimensions: 768,
    });
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
    if (result.ok) {
      expect(result.dim).toBe(768);
      expect(result.provider).toBe('ollama');
    }
  });

  test('rejects dimensions outside the recipe allow-list', () => {
    const result = resolveSchemaEmbeddingDim({
      embedding_model: 'ollama:qwen3-embedding:0.6b',
      embedding_dimensions: 1000,
    });
    expect(result.ok).toBe(false);
  });
});
