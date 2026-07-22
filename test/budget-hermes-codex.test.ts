import { describe, expect, test } from 'bun:test';
import { BudgetTracker } from '../src/core/budget/budget-tracker.ts';

describe('BudgetTracker hermes-codex local proxy pricing', () => {
  test('max-cost bounded chat reserves do not no_pricing fail for hermes-codex models', () => {
    const tracker = new BudgetTracker({ label: 'skillopt:ui-discipline-flow', maxCostUsd: 5 });
    expect(() => tracker.reserve({
      modelId: 'hermes-codex:gpt-5.5',
      estimatedInputTokens: 50_000,
      maxOutputTokens: 4_000,
      kind: 'chat',
    })).not.toThrow();
    expect(() => tracker.reserve({
      modelId: 'hermes-codex:gpt-5.4-mini',
      estimatedInputTokens: 50_000,
      maxOutputTokens: 4_000,
      kind: 'chat',
    })).not.toThrow();
    expect(tracker.totalSpent).toBe(0);
  });
});
