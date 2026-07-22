import { describe, expect, test } from 'bun:test';
import { getRecipe, listRecipes } from '../../src/core/ai/recipes/index.ts';
import { applyOpenAICompatConfig, applyResolveAuth } from '../../src/core/ai/gateway.ts';
import { assertTouchpoint } from '../../src/core/ai/model-resolver.ts';

describe('Hermes Codex OAuth proxy recipe', () => {
  test('is registered as an OpenAI-compatible chat provider', () => {
    const recipe = getRecipe('hermes-codex');
    expect(recipe).toBeDefined();
    expect(listRecipes().some((r) => r.id === 'hermes-codex')).toBe(true);
    expect(recipe!.implementation).toBe('openai-compatible');
    expect(recipe!.tier).toBe('openai-compat');
    expect(recipe!.auth_env?.required).toEqual([]);
    expect(recipe!.auth_env?.optional).toContain('HERMES_CODEX_PROXY_BASE_URL');
    expect(recipe!.touchpoints.chat).toBeDefined();
    expect(recipe!.touchpoints.chat!.supports_tools).toBe(true);
    expect(recipe!.touchpoints.expansion).toBeDefined();
  });

  test('uses local bearer auth without requiring a static provider key', () => {
    const recipe = getRecipe('hermes-codex')!;
    const auth = applyResolveAuth(recipe, { env: {} } as any, 'chat');
    expect(typeof auth.apiKey).toBe('string');
    expect(auth.apiKey!.length).toBeGreaterThan(0);
    const keyed = applyResolveAuth(recipe, { env: { HERMES_CODEX_PROXY_KEY: 'proxy-secret' } } as any, 'chat');
    expect(keyed).toEqual({ apiKey: 'proxy-secret' });
  });

  test('allows account/runtime-specific Codex model ids without hardcoding stale catalog', () => {
    const recipe = getRecipe('hermes-codex')!;
    expect(recipe.touchpoints.chat!.models).toEqual([]);
    expect(() => assertTouchpoint(recipe, 'chat', 'gpt-5.5')).not.toThrow();
    expect(() => assertTouchpoint(recipe, 'chat', 'codex-account-model')).not.toThrow();
  });

  test('defaults to local proxy base URL and honors env override', () => {
    const recipe = getRecipe('hermes-codex')!;
    expect(applyOpenAICompatConfig(recipe, { env: {} } as any).baseURL).toBe('http://127.0.0.1:8765/v1');
    expect(applyOpenAICompatConfig(recipe, { env: { HERMES_CODEX_PROXY_BASE_URL: 'http://127.0.0.1:9999/v1/' } } as any).baseURL).toBe('http://127.0.0.1:9999/v1');
  });
});
