export const OLLAMA_QWEN3_EMBEDDING_06B_MODEL_ID = 'qwen3-embedding:0.6b';
export const OLLAMA_QWEN3_QUERY_PREFIX =
  'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ';

export function isOllamaQwen3Embedding06B(recipeId: string, modelId: string): boolean {
  return recipeId === 'ollama' && modelId === OLLAMA_QWEN3_EMBEDDING_06B_MODEL_ID;
}

/**
 * Prepare the exact-model transport input. Documents are returned unchanged;
 * only query inputs receive Qwen3's retrieval instruction prefix.
 */
export function prepareOllamaQwen3EmbeddingInput(
  text: string | null | undefined,
  inputType: 'query' | 'document' | undefined,
): string {
  const value = text ?? '';
  return inputType === 'query' ? `${OLLAMA_QWEN3_QUERY_PREFIX}${value}` : value;
}
