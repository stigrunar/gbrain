# Canonical Qwen chunker compatibility

This retained-feature branch keeps conservative, lossless Qwen embedding input handling alongside upstream improvements. It must not silently drop the dense-text word-count floor when adopting linear greedy-merge word statistics.

## Word-count contract

The canonical word count is `max(CJK-aware words, ceil(non-whitespace UTF-16 units / 6))`. Greedy merging uses the same floor from `combinedStats.nonWhitespace`, retaining constant-time stat concatenation rather than repeatedly scanning the growing string. Token-fit fast paths and lossless estimated-token caps remain enabled.

## Historical boundary proof

The separate `test/fixtures/goldens/chunker/word-count-fuzz-canonical-qwen.json` fixture was produced by the actual immutable canonical source at `7fa75c510e6ba5c941bc1149e5a59ecab0c41e7d`, before the linear-counting merge. Seed 7301 covers 1500 mixed Latin/CJK/emoji cases. Restoring the running-stat floor made the new implementation match the old canonical hashes on every case; chunker version remains 5 because canonical boundaries are preserved.

The upstream stock `word-count-fuzz.json` remains untouched. It differs from the retained fork on 527 cases and is not an appropriate canonical-fork baseline. The new fixture is not captured from the implementation under test. Intentional boundary changes require a reviewed new reference/provenance and a sound chunker-version/reindex decision; the canonical parity test rejects blind `GBRAIN_TEST_UPDATE_GOLDENS=1` overwrites.

## Required regression checks

- Typecheck and module/function size ratchets.
- The combined retained Hermes Codex, Qwen dimension/document/query transport, lossless token-cap and reindex tests.
- All `test/chunkers/*.test.ts`, including historical boundary parity, fast token-fit equivalence and CJK overlap.
- Reservation identity, budget tracker/composition and gateway tests.

Resolve counted size ceilings from actual combined source measurements. Never pick a conflict side blindly or remove conservative estimates simply to match stock fixtures.

[Repository overview](../../README.md)
