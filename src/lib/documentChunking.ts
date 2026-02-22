/**
 * Document chunking utility for RAG implementation
 * Splits documents into smaller chunks for better embedding and retrieval
 */

export interface DocumentChunk {
  content: string;
  index: number;
  tokenCount: number;
  metadata: {
    startChar: number;
    endChar: number;
    type: 'paragraph' | 'section' | 'list' | 'table';
  };
}

// Approximate token count (1 token ≈ 4 characters for English text)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// Clean and normalize text
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();
}

// Split text by sentences while preserving context
function splitBySentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

// Main chunking function
export function chunkDocument(
  content: string,
  options: {
    maxChunkSize?: number; // Max tokens per chunk
    overlapSize?: number; // Tokens to overlap between chunks
    preserveSentences?: boolean; // Try to keep sentences intact
  } = {}
): DocumentChunk[] {
  const {
    maxChunkSize = 500,
    overlapSize = 50,
    preserveSentences = true,
  } = options;

  const cleanedContent = cleanText(content);
  
  if (!cleanedContent || cleanedContent.length < 50) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  let currentPosition = 0;
  let chunkIndex = 0;

  if (preserveSentences) {
    // Sentence-aware chunking
    const sentences = splitBySentences(cleanedContent);
    let currentChunk = '';
    let chunkStartChar = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const tentativeChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      const tentativeTokens = estimateTokenCount(tentativeChunk);

      if (tentativeTokens > maxChunkSize && currentChunk) {
        // Create chunk from current content
        const tokenCount = estimateTokenCount(currentChunk);
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount,
          metadata: {
            startChar: chunkStartChar,
            endChar: chunkStartChar + currentChunk.length,
            type: 'paragraph',
          },
        });

        // Start new chunk with overlap
        const overlapText = getOverlapText(currentChunk, overlapSize);
        currentChunk = overlapText + sentence;
        chunkStartChar = chunkStartChar + currentChunk.length - overlapText.length;
      } else {
        if (!currentChunk) {
          chunkStartChar = cleanedContent.indexOf(sentence);
        }
        currentChunk = tentativeChunk;
      }
    }

    // Add final chunk if there's remaining content
    if (currentChunk.trim()) {
      const tokenCount = estimateTokenCount(currentChunk);
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        tokenCount,
        metadata: {
          startChar: chunkStartChar,
          endChar: chunkStartChar + currentChunk.length,
          type: 'paragraph',
        },
      });
    }
  } else {
    // Simple character-based chunking
    const maxChunkChars = maxChunkSize * 4; // Approximate chars per chunk
    const overlapChars = overlapSize * 4; // Approximate overlap chars

    while (currentPosition < cleanedContent.length) {
      const endPosition = Math.min(
        currentPosition + maxChunkChars,
        cleanedContent.length
      );

      let chunkContent = cleanedContent.slice(currentPosition, endPosition);

      // Try to end at a word boundary if not at the end
      if (endPosition < cleanedContent.length) {
        const lastSpaceIndex = chunkContent.lastIndexOf(' ');
        if (lastSpaceIndex > chunkContent.length * 0.8) {
          chunkContent = chunkContent.slice(0, lastSpaceIndex);
        }
      }

      const tokenCount = estimateTokenCount(chunkContent);
      chunks.push({
        content: chunkContent.trim(),
        index: chunkIndex++,
        tokenCount,
        metadata: {
          startChar: currentPosition,
          endChar: currentPosition + chunkContent.length,
          type: 'section',
        },
      });

      // Move position forward with overlap
      currentPosition += chunkContent.length - overlapChars;
      if (currentPosition >= cleanedContent.length) break;
    }
  }

  return chunks.filter(chunk => chunk.content.length > 20); // Filter out very short chunks
}

// Get overlap text from the end of a chunk
function getOverlapText(text: string, overlapTokens: number): string {
  const overlapChars = overlapTokens * 4; // Approximate
  if (text.length <= overlapChars) return text;
  
  const overlapText = text.slice(-overlapChars);
  
  // Try to start at a word boundary
  const firstSpaceIndex = overlapText.indexOf(' ');
  if (firstSpaceIndex > 0 && firstSpaceIndex < overlapChars * 0.5) {
    return overlapText.slice(firstSpaceIndex + 1);
  }
  
  return overlapText;
}

// Specialized chunking for different document types
export function chunkByDocumentType(
  content: string,
  documentType: 'contract' | 'document' | 'legal' | 'general'
): DocumentChunk[] {
  switch (documentType) {
    case 'contract':
    case 'legal':
      // Legal documents benefit from larger, more contextual chunks
      return chunkDocument(content, {
        maxChunkSize: 800,
        overlapSize: 100,
        preserveSentences: true,
      });
    
    case 'document':
      // Standard document chunking
      return chunkDocument(content, {
        maxChunkSize: 600,
        overlapSize: 75,
        preserveSentences: true,
      });
    
    default:
      // General purpose chunking
      return chunkDocument(content, {
        maxChunkSize: 500,
        overlapSize: 50,
        preserveSentences: true,
      });
  }
}

// Merge chunks if they are too small
export function optimizeChunks(chunks: DocumentChunk[], minTokenCount: number = 100): DocumentChunk[] {
  const optimized: DocumentChunk[] = [];
  let i = 0;

  while (i < chunks.length) {
    let currentChunk = chunks[i];

    // If chunk is too small, try to merge with next chunk
    while (
      i + 1 < chunks.length &&
      currentChunk.tokenCount < minTokenCount &&
      currentChunk.tokenCount + chunks[i + 1].tokenCount < 800 // Don't exceed reasonable limit
    ) {
      const nextChunk = chunks[i + 1];
      currentChunk = {
        content: currentChunk.content + '\n\n' + nextChunk.content,
        index: currentChunk.index,
        tokenCount: currentChunk.tokenCount + nextChunk.tokenCount,
        metadata: {
          startChar: currentChunk.metadata.startChar,
          endChar: nextChunk.metadata.endChar,
          type: currentChunk.metadata.type,
        },
      };
      i++;
    }

    optimized.push(currentChunk);
    i++;
  }

  return optimized;
}