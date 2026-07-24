import { describe, expect, test } from 'bun:test';
import {
  capByEstimatedTokens,
  chunkText,
  DEFAULT_MAX_EST_TOKENS,
} from '../../src/core/chunkers/recursive.ts';
import { chunkCodeText } from '../../src/core/chunkers/code.ts';
import { estimateEmbeddingTokens } from '../../src/core/cjk.ts';

function urlDenseKoreanRollup(lines: number): string {
  const out: string[] = ['# 링크가 줄마다 붙는 한국어 예시 문서', ''];
  for (let i = 0; i < lines; i++) {
    const hex32 = (i * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4);
    out.push(
      `- **항목 ${i}**: 이 줄은 청커 동작 검증을 위한 의미 없는 한국어 예시 문장입니다 · 전화 000-0000-${String(1000 + i)} · ` +
      `이메일 user${i}@example.com · 링크: https://docs.example.com/pages/${hex32}?v=abcdef0123456789&ref=sample`,
    );
  }
  return out.join('\n');
}

function bigJsonBlock(targetChars: number): string {
  const entries: string[] = [];
  let i = 0;
  let length = 0;
  while (length < targetChars) {
    const row =
      `  "item_${i}": { "name": "예시-${i}", "url": "https://example.com/api/v2/items/${i}?token=abc${i}def", "qty": ${i % 100}, "memo": "한국어 값이 섞인 예시 데이터" }`;
    entries.push(row);
    length += row.length;
    i++;
  }
  return `{\n${entries.join(',\n')}\n}`;
}

describe('estimated-token cap — pathological content', () => {
  test('fallback chunks cap the structured header without losing source content', async () => {
    const source = Array.from({ length: 300 }, () => 'x'.repeat(7)).join(' ');
    const chunks = await chunkCodeText(source, 'unknown.xyz');
    const header = '[JavaScript] unknown.xyz:1-1 module\n\n';

    expect(chunks.length).toBeGreaterThan(1);
    for (const [index, chunk] of chunks.entries()) {
      expect(estimateEmbeddingTokens(chunk.text)).toBeLessThanOrEqual(DEFAULT_MAX_EST_TOKENS);
      expect(chunk.index).toBe(index);
      expect(chunk.metadata).toMatchObject({
        symbolName: null,
        symbolType: 'module',
        filePath: 'unknown.xyz',
        language: 'javascript',
        startLine: 1,
        endLine: 1,
      });
    }

    expect(chunks.map(chunk => chunk.text.replace(header, '')).join('')).toBe(source);
  });

  test('URL-dense CJK chunks remain under the cap and retain markers', () => {
    const chunks = chunkText(urlDenseKoreanRollup(60));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(estimateEmbeddingTokens(chunk.text)).toBeLessThanOrEqual(DEFAULT_MAX_EST_TOKENS);
    }
    const joined = chunks.map(chunk => chunk.text).join('\n');
    expect(joined).toContain('항목 0');
    expect(joined).toContain('항목 30');
    expect(joined).toContain('항목 59');
  });

  test('pretty and minified JSON split rather than truncate', () => {
    const pretty = `설정 파일 원문 보존:\n\n\`\`\`\n${bigJsonBlock(7000)}\n\`\`\`\n`;
    const minified = bigJsonBlock(7000).replace(/\n\s*/g, '');
    for (const text of [pretty, minified]) {
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(estimateEmbeddingTokens(chunk.text)).toBeLessThanOrEqual(DEFAULT_MAX_EST_TOKENS);
      }
    }
  });

  test('code chunks get the same final cap', async () => {
    const chunks = await chunkCodeText(bigJsonBlock(7000), 'fence.json');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(estimateEmbeddingTokens(chunk.text)).toBeLessThanOrEqual(DEFAULT_MAX_EST_TOKENS + 60);
    }
  });
});

describe('capByEstimatedTokens', () => {
  test('leaves small input unchanged', () => {
    expect(capByEstimatedTokens('short text', 1500)).toEqual(['short text']);
    expect(capByEstimatedTokens('', 1500)).toEqual([]);
  });

  test('prefers newline boundaries', () => {
    const line = 'x'.repeat(100);
    const text = Array.from({ length: 40 }, () => line).join('\n');
    const pieces = capByEstimatedTokens(text, 1000);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(text);
    for (const piece of pieces.slice(0, -1)) {
      expect(piece.endsWith('\n')).toBe(true);
    }
  });

  test('makes forward progress on whitespace-less input without dropping content', () => {
    const blob = 'a'.repeat(10_000);
    const pieces = capByEstimatedTokens(blob, 1000);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(blob);
    for (const piece of pieces) {
      expect(estimateEmbeddingTokens(piece)).toBeLessThanOrEqual(1000);
    }
  });
});

describe('estimateEmbeddingTokens', () => {
  test('handles URL-dense ASCII, CJK, whitespace, and empty input', () => {
    const url = 'https://docs.example.com/pages/a1b2c3d4e5f6?v=abc&ref=sample';
    expect(estimateEmbeddingTokens(url)).toBeGreaterThanOrEqual(Math.floor(url.length * 0.7));
    expect(estimateEmbeddingTokens('가나다라마')).toBe(5);
    expect(estimateEmbeddingTokens('   \n\t  ')).toBeLessThanOrEqual(1);
    expect(estimateEmbeddingTokens('')).toBe(0);
  });
});
