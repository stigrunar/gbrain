import type { Recipe } from '../types.ts';

/**
 * Local OpenAI-compatible proxy backed by Hermes OpenAI Codex OAuth.
 *
 * Start the proxy with:
 *   ~/.hermes/scripts/gbrain-skillopt-codex-oauth --serve
 *
 * Then point GBrain chat/SkillOpt models at hermes-codex:<model>. The proxy
 * translates /v1/chat/completions to ChatGPT Codex Responses API calls using
 * Hermes-managed openai-codex OAuth. No Nous account or static OpenAI API key is
 * required.
 */
export const hermesCodex: Recipe = {
  id: 'hermes-codex',
  name: 'Hermes OpenAI Codex OAuth proxy',
  tier: 'openai-compat',
  implementation: 'openai-compatible',
  base_url_default: 'http://127.0.0.1:8765/v1',
  auth_env: {
    required: [],
    optional: ['HERMES_CODEX_PROXY_BASE_URL', 'HERMES_CODEX_PROXY_KEY'],
    setup_url: 'Run ~/.hermes/scripts/gbrain-skillopt-codex-oauth --serve, then use --optimizer-model hermes-codex:<model>.',
  },
  touchpoints: {
    chat: {
      models: [],
      supports_tools: true,
      supports_subagent_loop: false,
      supports_prompt_cache: true,
      max_context_tokens: 272000,
      cost_per_1m_input_usd: 0,
      cost_per_1m_output_usd: 0,
      price_last_verified: '2026-06-30',
    },
    expansion: {
      models: [],
      cost_per_1m_tokens_usd: 0,
      price_last_verified: '2026-06-30',
    },
  },
  setup_hint: 'Uses a local proxy backed by Hermes openai-codex OAuth. Start it with ~/.hermes/scripts/gbrain-skillopt-codex-oauth --serve; no Nous account required.',
  resolveOpenAICompatConfig(env) {
    return {
      baseURL: (env.HERMES_CODEX_PROXY_BASE_URL || 'http://127.0.0.1:8765/v1').replace(/\/+$/, ''),
    };
  },
  async probe(baseURL?: string) {
    const root = (baseURL || process.env.HERMES_CODEX_PROXY_BASE_URL || 'http://127.0.0.1:8765/v1').replace(/\/+$/, '');
    try {
      const res = await fetch(`${root}/models`, { signal: AbortSignal.timeout(200) });
      return { ready: res.ok, hint: res.ok ? undefined : `Hermes Codex proxy returned HTTP ${res.status}` };
    } catch {
      return { ready: false, hint: 'Start local proxy: ~/.hermes/scripts/gbrain-skillopt-codex-oauth --serve' };
    }
  },
};
