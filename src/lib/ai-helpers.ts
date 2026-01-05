/**
 * AI Helper Utilities
 * Phase 3: Ream AI Performance Optimizations
 */

// Token counting utility (approximate)
export function countTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English text
  // This is a simplified version; for production, use tiktoken or similar
  return Math.ceil(text.length / 4);
}

// Context window management
const MAX_CONTEXT_TOKENS = 80000; // Conservative limit
const MAX_HISTORY_TOKENS = 20000; // Reserve for conversation history

export interface ContextChunk {
  content: string;
  tokens: number;
  priority: number;
  source?: string;
}

export function manageContextWindow(
  chunks: ContextChunk[],
  currentQuery: string,
  conversationHistory: string = ''
): string {
  const queryTokens = countTokens(currentQuery);
  const historyTokens = countTokens(conversationHistory);
  const availableTokens = MAX_CONTEXT_TOKENS - queryTokens - historyTokens - MAX_HISTORY_TOKENS;

  // Sort chunks by priority (higher is better)
  const sortedChunks = [...chunks].sort((a, b) => b.priority - a.priority);

  let totalTokens = 0;
  const selectedChunks: ContextChunk[] = [];

  for (const chunk of sortedChunks) {
    if (totalTokens + chunk.tokens <= availableTokens) {
      selectedChunks.push(chunk);
      totalTokens += chunk.tokens;
    } else {
      break;
    }
  }

  // Combine selected chunks
  return selectedChunks
    .map((chunk, index) => {
      const source = chunk.source ? `[SOURCE ${index + 1}: ${chunk.source}]` : '';
      return `${source}\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

// Request debouncing
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Cache for frequent queries
interface QueryCacheEntry {
  query: string;
  response: string;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const queryCache = new Map<string, QueryCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedQuery(query: string): string | null {
  const cacheKey = query.toLowerCase().trim();
  const entry = queryCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    queryCache.delete(cacheKey);
    return null;
  }

  return entry.response;
}

export function setCachedQuery(query: string, response: string, ttl: number = CACHE_TTL): void {
  const cacheKey = query.toLowerCase().trim();
  queryCache.set(cacheKey, {
    query: cacheKey,
    response,
    timestamp: Date.now(),
    ttl,
  });
}

// Clear cache
export function clearQueryCache(): void {
  queryCache.clear();
}

// Smart chunking for documents
export function smartChunkText(
  text: string,
  maxChunkSize: number = 2000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.split(/[.!?]+\s+/);

  for (const sentence of sentences) {
    const sentenceWithPunctuation = sentence + '. ';
    const potentialChunk = currentChunk + sentenceWithPunctuation;

    if (countTokens(potentialChunk) <= maxChunkSize) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/);
      const overlapText = words.slice(-Math.floor(overlap / 10)).join(' ');
      currentChunk = overlapText + ' ' + sentenceWithPunctuation;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Relevance scoring for RAG
export function calculateRelevanceScore(
  query: string,
  documentText: string,
  metadata?: Record<string, any>
): number {
  const queryLower = query.toLowerCase();
  const docLower = documentText.toLowerCase();

  // Simple keyword matching score
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  let matchCount = 0;
  let totalWords = queryWords.length;

  for (const word of queryWords) {
    if (docLower.includes(word)) {
      matchCount++;
    }
  }

  const keywordScore = totalWords > 0 ? matchCount / totalWords : 0;

  // Boost score based on metadata
  let metadataBoost = 0;
  if (metadata) {
    if (metadata.recent) metadataBoost += 0.1;
    if (metadata.important) metadataBoost += 0.1;
    if (metadata.relevance) metadataBoost += metadata.relevance * 0.2;
  }

  return Math.min(1, keywordScore + metadataBoost);
}

// Multi-document context merging
export function mergeDocumentContexts(
  contexts: Array<{ content: string; score: number; source: string }>,
  maxTokens: number = 40000
): string {
  // Sort by relevance score
  const sorted = [...contexts].sort((a, b) => b.score - a.score);

  let totalTokens = 0;
  const selected: string[] = [];

  for (const context of sorted) {
    const tokens = countTokens(context.content);
    if (totalTokens + tokens <= maxTokens) {
      selected.push(`[SOURCE: ${context.source}]\n${context.content}`);
      totalTokens += tokens;
    } else {
      // Try to fit a partial chunk
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 1000) {
        const partial = context.content.substring(0, remainingTokens * 4);
        selected.push(`[SOURCE: ${context.source} - PARTIAL]\n${partial}...`);
      }
      break;
    }
  }

  return selected.join('\n\n---\n\n');
}

// Conversation history optimization
export function optimizeConversationHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = MAX_HISTORY_TOKENS
): string {
  // Keep system message and last few messages
  const systemMessage = messages.find(m => m.role === 'system');
  const recentMessages = messages.slice(-10); // Last 10 messages

  let history = systemMessage ? `${systemMessage.content}\n\n` : '';
  let totalTokens = countTokens(history);

  // Add recent messages in reverse order until we hit the limit
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    const msgText = `${msg.role}: ${msg.content}\n\n`;
    const msgTokens = countTokens(msgText);

    if (totalTokens + msgTokens <= maxTokens) {
      history = msgText + history;
      totalTokens += msgTokens;
    } else {
      break;
    }
  }

  return history;
}

