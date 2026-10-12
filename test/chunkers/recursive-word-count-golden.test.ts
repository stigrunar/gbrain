/**
 * Canonical Qwen boundaries pinned before the linear counting rewrite.
 * The fork retains a dense-text floor and stricter token caps, so the stock
 * upstream golden does not describe its contract. The separate canonical
 * fixture was produced from immutable 7fa75c510e6ba5c941bc1149e5a59ecab0c41e7d,
 * not regenerated from this implementation to hide a parity failure.
 * Intentional boundary changes need a version bump and a reviewed reference
 * capture with truthful provenance. Keep the original stock fixture unchanged.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkText, MARKDOWN_CHUNKER_VERSION } from '../../src/core/chunkers/recursive.ts';
import { fuzzCases } from './word-count-fuzz-corpus.ts';

const FILE = join(import.meta.dir, '..', 'fixtures', 'goldens', 'chunker', 'word-count-fuzz-canonical-qwen.json');
const UPDATE = process.env.GBRAIN_TEST_UPDATE_GOLDENS === '1';
const SEED = 7301;
const COUNT = 1500;

describe('chunkText boundaries on the mixed-script fuzz corpus', () => {
  test('every case matches canonical boundaries captured before linear counting', () => {
    if (UPDATE) throw new Error('Capture a reviewed historical reference; do not overwrite parity from the implementation under test');
    const hashes = fuzzCases(SEED, COUNT).map(c => {
      const chunks = chunkText(c.text, { chunkSize: c.chunkSize, chunkOverlap: c.chunkOverlap });
      return createHash('sha256').update(JSON.stringify(chunks)).digest('hex').slice(0, 16);
    });
    const golden = JSON.parse(readFileSync(FILE, 'utf8')) as {
      seed: number; count: number; hashes: string[];
      provenance: { source_sha: string; chunker_version: number };
    };
    expect(golden.seed).toBe(SEED);
    expect(golden.provenance.source_sha).toBe('7fa75c510e6ba5c941bc1149e5a59ecab0c41e7d');
    expect(MARKDOWN_CHUNKER_VERSION).toBe(golden.provenance.chunker_version);
    const mismatched = hashes.flatMap((h, i) => (h === golden.hashes[i] ? [] : [i]));
    expect(mismatched).toEqual([]);
    expect(hashes.length).toBe(golden.count);
  }, 120_000);
});
