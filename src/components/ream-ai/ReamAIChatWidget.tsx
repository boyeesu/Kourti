/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Minimize2, Maximize2, FileText, Sparkles, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEnhancedDocumentAnalysis } from '@/hooks/useEnhancedDocumentAnalysis';
import { useReamAIAssistant } from '@/hooks/useReamAIAssistant';
import { useUploadDocument } from '@/hooks/useDocuments';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { useProcessDocument } from '@/hooks/useRAGSearch';
import { logInfo, logError, logWarn } from '@/lib/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ReamAIChatWidgetProps {
  variant?: 'floating' | 'embedded';
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMinimized?: boolean;
  className?: string;
  documentContext?: {
    id: string;
    title: string;
    content?: string;
  } | null;
}

export function ReamAIChatWidget({
  variant = 'embedded',
  onMinimize,
  onMaximize,
  isMinimized = false,
  className,
  documentContext,
}: ReamAIChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm Ream AI, your intelligent legal assistant. I can help you with:\n\n• General legal questions and explanations\n• Information about your cases, clients, and practice data\n• Document review and analysis (upload a file first)\n\nAsk me anything!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocument, setUploadedDocument] = useState<{
    id: string;
    name?: string;
    content?: string;
    file_path?: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { streamAnalysis } = useEnhancedDocumentAnalysis();
  const { sendMessage: sendAssistantMessage, isLoading: assistantLoading } = useReamAIAssistant();
  const uploadDocument = useUploadDocument();
  const { data: organization } = useCurrentUserOrganization();
  const processDocument = useProcessDocument();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // RAG search helper - retrieves relevant context from document chunks
  const performRAGSearch = useCallback(async (query: string): Promise<string> => {
    try {
      if (!query || query.trim().length < 10) {
        return '';
      }

      logInfo('Performing RAG search for document analysis', { queryLength: query.length });

      // Use the dedicated rag-search edge function which bypasses PostgREST RPC issues
      const { data: searchData, error: searchError } = await supabase.functions.invoke(
        'rag-search',
        {
          body: {
            query: query.substring(0, 2000),
            matchThreshold: 0.6,
            matchCount: 8,
          },
        }
      );

      if (searchError) {
        logError('RAG search edge function error', { error: searchError });
        return '';
      }

      if (!searchData?.success || !searchData?.results || searchData.results.length === 0) {
        logInfo('No RAG results found', { message: searchData?.message });
        return '';
      }

      // Build RAG context string from results
      const ragContext = searchData.results
        .map((result: any, index: number) => {
          const sourceName = result.documentName || 'Unknown Document';
          const similarity = ((result.similarity || 0) * 100).toFixed(1);

          return `[RELATED CONTENT ${index + 1}] From "${sourceName}" (${similarity}% match):\n${(result.content || '').substring(0, 800)}`;
        })
        .join('\n\n---\n\n');

      logInfo('RAG search completed', { resultCount: searchData.results.length });
      return ragContext;
    } catch (error) {
      logError('RAG search error', { error });
      return '';
    }
  }, []);

  // Handle document upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length && !isUploading) {
      const file = acceptedFiles[0];

      // Validate file before upload
      try {
        const { validateFile } = await import('@/lib/fileValidation');
        const validation = validateFile(file);
        if (!validation.valid) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `❌ ${validation.error || 'File validation failed'}`,
              timestamp: new Date(),
            },
          ]);
          return;
        }
      } catch (error) {
        console.error('File validation error:', error);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '❌ Failed to validate file',
            timestamp: new Date(),
          },
        ]);
        return;
      }

      setIsUploading(true);

      // Add upload message
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: `Uploading "${file.name}" for analysis...`,
          timestamp: new Date(),
        },
      ]);

      try {
        // Upload document to database
        const uploadedDoc = await uploadDocument.mutateAsync({
          name: file.name,
          file: file,
          metadata: {
            uploaded_via: 'ream_ai_widget',
            upload_date: new Date().toISOString(),
          },
        });

        // Extract text content
        let extractedText = '';

        // Client-side extraction for DOCX
        if (file.name.toLowerCase().endsWith('.docx')) {
          try {
            // Dynamically import mammoth to avoid build issues if it's not tree-shaken
            const mammoth = await import('mammoth');
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            extractedText = result.value;
            if (result.messages && result.messages.length > 0) {
              console.log('Mammoth messages:', result.messages);
            }
          } catch (e) {
            console.error('Client-side DOCX extraction failed:', e);
          }
        }
        // Client-side extraction for Text
        else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
          extractedText = await file.text();
        }

        // Server-side extraction fallback (with timeout)
        if (!extractedText && uploadedDoc.file_path) {
          try {
            // Create a promise that rejects after 30 seconds (increased timeout for large files)
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Extraction timed out')), 30000);
            });

            const extractionPromise = supabase.functions.invoke('extract-document-text', {
              body: { documentId: uploadedDoc.id, filePath: uploadedDoc.file_path },
            });

            // Race the extraction against the timeout
            const { data: extractResult, error: extractError } = (await Promise.race([
              extractionPromise,
              timeoutPromise,
            ])) as any;

            if (!extractError && extractResult?.content) {
              // Only use extracted text if it's valid (not an error message)
              if (extractResult.content && !extractResult.content.startsWith('[')) {
                extractedText = extractResult.content;
                console.log('Server-side extraction successful, length:', extractedText.length);
              } else {
                console.warn(
                  'Server-side extraction returned error message:',
                  extractResult.content
                );
                if (extractResult.error) {
                  console.error('Extraction error:', extractResult.error);
                }
              }
            } else if (extractError) {
              console.error('Server-side extraction error:', extractError);
            }
          } catch (extractErr) {
            const errorMsg = extractErr instanceof Error ? extractErr.message : String(extractErr);
            console.error('Text extraction failed or timed out:', errorMsg);
            // Don't fail the whole upload if extraction only fails
          }
        }

        // Set uploaded document state with extracted content
        setUploadedDocument({
          id: uploadedDoc.id,
          name: uploadedDoc.name ?? undefined,
          content: extractedText || undefined,
          file_path: uploadedDoc.file_path ?? undefined,
        });

        // Process for RAG (non-blocking) - only if we have valid extracted text
        if (
          organization?.id &&
          extractedText &&
          extractedText.length > 50 &&
          !extractedText.startsWith('[')
        ) {
          // Process in background without blocking UI
          processDocument
            .mutateAsync({
              documentId: uploadedDoc.id,
              content: extractedText,
              documentType: 'document',
            })
            .then(() => {
              console.log('Background RAG processing complete for document:', uploadedDoc.id);
              logInfo('RAG processing completed', { documentId: uploadedDoc.id });
            })
            .catch((processError) => {
              console.error('Background RAG processing error:', processError);
              logError('RAG processing failed', {
                error: processError,
                documentId: uploadedDoc.id,
              });
            });
        } else if (!extractedText || extractedText.length <= 50) {
          console.warn('Skipping RAG processing - insufficient extracted text', {
            documentId: uploadedDoc.id,
            textLength: extractedText?.length || 0,
          });
        }

        // Clear loading state
        setIsUploading(false);

        // Provide user feedback based on extraction success
        const hasValidContent =
          extractedText && extractedText.length > 50 && !extractedText.startsWith('[');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: hasValidContent
              ? `✅ Document "${file.name}" uploaded and processed! I've extracted ${extractedText.length.toLocaleString()} characters. You can start asking questions right away while I process it for deep search.`
              : `✅ Document "${file.name}" uploaded! ${extractedText ? 'Note: Text extraction was limited. ' : ''}You can still ask questions, and I'll help based on available information.`,
            timestamp: new Date(),
          },
        ]);

        toast({
          title: 'Document Uploaded',
          description: 'The document is ready for chat.',
        });
      } catch (error: unknown) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ Failed to upload "${file.name}": ${errorMessage}`,
            timestamp: new Date(),
          },
        ]);
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: errorMessage,
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    noClick: false,
    noDrag: false,
    multiple: false,
  });

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping || assistantLoading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    // Add typing indicator
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    setIsTyping(true);

    try {
      // Determine if this is a document-specific query or system-wide query
      const activeDocContext = uploadedDocument?.content || documentContext?.content;
      const hasDocumentContext = activeDocContext && activeDocContext.trim().length > 0;

      // Improved query detection - more comprehensive keyword matching
      const messageLower = userMessage.toLowerCase();
      const documentKeywords = [
        'review',
        'analyze',
        'document',
        'contract',
        'clause',
        'term',
        'parties',
        'party',
        'agreement',
        'section',
        'provision',
        'article',
        'obligation',
        'liability',
        'indemnity',
        'termination',
        'renewal',
        'confidential',
        'warranty',
        'representation',
        'covenant',
        'summarize',
        'summary',
        'key points',
        'main points',
        'risks',
        'issues',
        'concerns',
        'problems',
        'this document',
        'the document',
        'in here',
        'in this',
        'what does it say',
        'what is stated',
        'according to',
      ];

      const isDocumentQuery =
        hasDocumentContext &&
        (documentKeywords.some((keyword) => messageLower.includes(keyword)) ||
          // If there's document context and the question is short (likely about the doc)
          (messageLower.length < 100 &&
            !messageLower.includes('how many') &&
            !messageLower.includes('my client')));

      if (isDocumentQuery && hasDocumentContext) {
        // Use document analysis for document-specific queries
        const docTitle = uploadedDocument?.name || documentContext?.title || 'Uploaded Document';
        const docContent = activeDocContext;

        // Perform RAG search to find related content from other documents
        logInfo('Starting RAG-enhanced document analysis');
        const ragContext = await performRAGSearch(userMessage);

        // Truncate document content if it's too large to prevent payload size issues
        // Keep beginning and end for better context preservation
        const MAX_DOC_CONTENT_LENGTH = 80000; // ~80k chars to leave room for prompt and RAG context
        let processedDocContent = docContent;
        let contentTruncated = false;

        if (docContent.length > MAX_DOC_CONTENT_LENGTH) {
          const startLength = Math.floor(MAX_DOC_CONTENT_LENGTH * 0.6);
          const endLength = Math.floor(MAX_DOC_CONTENT_LENGTH * 0.4);
          const start = docContent.substring(0, startLength);
          const end = docContent.substring(docContent.length - endLength);
          processedDocContent = `${start}\n\n[... Document content truncated for size management. Showing beginning and end of document ...]\n\n${end}`;
          contentTruncated = true;
          logWarn('Document content truncated in chat widget', {
            originalLength: docContent.length,
            truncatedLength: MAX_DOC_CONTENT_LENGTH,
          });
        }

        const analysisPrompt = `You are currently reviewing a document. ALL questions should be answered using information from this document.

Document: ${docTitle}
${contentTruncated ? '\n[Note: Document content has been truncated for size management. Showing beginning and end sections.]' : ''}

DOCUMENT CONTENT:
${processedDocContent}

USER QUESTION: ${userMessage}

CRITICAL INSTRUCTIONS:
- This question is about the document above. Extract information directly from the document content
- ALL questions when document context is present should be answered using information from that document
- For example: "Who are the parties?" → Find and list the parties mentioned in the document
- "What is the termination clause?" → Find and explain the termination clause from the document
- Reference specific sections, clauses, or terms from the document when possible
- If information isn't in the document, say so clearly rather than guessing
- If related content from other documents is provided below, use it to provide additional context or comparisons when relevant`;

        await streamAnalysis({
          content: analysisPrompt,
          analysisType: 'general',
          ragContext: ragContext || undefined, // Pass RAG retrieved context
          onProgress: (content, done) => {
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant') {
                lastMessage.content = content;
              }
              return newMessages;
            });

            if (done) {
              setIsTyping(false);
            }
          },
        });
      } else {
        // Use system-wide assistant for general queries, database queries, and system interactions
        // Filter out empty messages (typing indicators) from conversation history
        const conversationHistory = messages
          .filter((msg) => msg.content.trim().length > 0)
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

        const docContext = uploadedDocument?.content || documentContext?.content;
        const response = await sendAssistantMessage(userMessage, conversationHistory, {
          documentContext: docContext
            ? {
                documentId: uploadedDocument?.id || documentContext?.id,
                documentContent: docContext,
              }
            : undefined,
        });

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = response;
          }
          return newMessages;
        });

        setIsTyping(false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsTyping(false);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.content = 'Sorry, I encountered an error. Please try again.';
        }
        return newMessages;
      });
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message',
      });
    }
  };

  if (isMinimized && variant === 'floating') {
    return (
      <button
        onClick={onMaximize}
        className={cn(
          'fixed z-50 rounded-full shadow-2xl',
          'bottom-4 right-4 h-16 w-16 sm:h-20 sm:w-20',
          'hover:scale-110 active:scale-95 transition-all duration-300',
          'cursor-pointer border-0 bg-transparent p-0',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full',
          'animate-bounce-slow hover:animate-none',
          className
        )}
        aria-label="Open Ream AI Chat"
      >
        <div className="relative w-full h-full">
          <img
            src="/kourti-mascot.png"
            alt="Kourti Mascot - Click to chat with Ream AI"
            className="w-full h-full object-contain drop-shadow-lg"
            onError={(e) => {
              // Fallback to Sparkles icon if mascot image not found
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('.mascot-fallback')) {
                const fallback = document.createElement('div');
                fallback.className =
                  'mascot-fallback w-full h-full flex items-center justify-center bg-primary rounded-full';
                const sparklesIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                sparklesIcon.setAttribute('class', 'h-8 w-8 text-primary-foreground');
                sparklesIcon.setAttribute('fill', 'none');
                sparklesIcon.setAttribute('stroke', 'currentColor');
                sparklesIcon.setAttribute('viewBox', '0 0 24 24');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-width', '2');
                path.setAttribute(
                  'd',
                  'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z'
                );
                sparklesIcon.appendChild(path);
                fallback.appendChild(sparklesIcon);
                parent.appendChild(fallback);
              }
            }}
          />
        </div>
      </button>
    );
  }

  return (
    <Card
      className={cn(
        variant === 'floating' && 'fixed z-50 shadow-2xl',
        // Responsive dimensions for floating widget
        variant === 'floating' && 'bottom-2 right-2 sm:bottom-4 sm:right-4',
        variant === 'floating' && 'w-[calc(100vw-1rem)] sm:w-96',
        variant === 'floating' && 'h-[calc(100vh-5rem)] sm:h-[600px]',
        variant === 'floating' && 'max-h-[calc(100vh-5rem)]',
        variant === 'embedded' && 'w-full h-full',
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5" />
          Ream AI
          {(documentContext || uploadedDocument) && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              {uploadedDocument?.name || documentContext?.title}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          {variant === 'floating' && (
            <>
              {isMinimized ? (
                <Button size="icon" variant="ghost" onClick={onMaximize} className="h-8 w-8">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" variant="ghost" onClick={onMinimize} className="h-8 w-8">
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col h-[calc(100%-4rem)] p-0 overflow-hidden">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.content === '' && isTyping && (
                    <div className="flex gap-1">
                      <div
                        className="h-2 w-2 bg-current rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="h-2 w-2 bg-current rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="h-2 w-2 bg-current rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form onSubmit={handleSend} className="border-t bg-background safe-area-bottom">
          {/* Upload section - more prominent */}
          <div
            {...getRootProps()}
            className={cn('px-4 pt-3 pb-2 border-b', isUploading && 'bg-muted/50')}
          >
            <input {...getInputProps()} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(
                'w-full h-9 text-sm font-medium',
                isUploading && 'opacity-75 cursor-not-allowed'
              )}
              disabled={isUploading || isTyping || assistantLoading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading document...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document (PDF, DOC, DOCX, TXT)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-1.5">
              Drag and drop a file here, or click to browse
            </p>
          </div>

          {/* Input section */}
          <div className="flex gap-2 p-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                documentContext || uploadedDocument
                  ? 'Ask about this document or anything...'
                  : 'Ask about cases, clients, documents, or anything...'
              }
              disabled={isTyping || assistantLoading || isUploading}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isTyping || assistantLoading || !input.trim() || isUploading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
