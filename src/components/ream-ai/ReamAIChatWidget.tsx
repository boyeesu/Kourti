/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Minimize2, Maximize2, FileText, Sparkles, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReamAIAssistant } from '@/hooks/useReamAIAssistant';
import { useUploadDocument } from '@/hooks/useDocuments';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { invokeNodeApi } from '@/lib/backendApi';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { useProcessDocument } from '@/hooks/useRAGSearch';
import { logError } from '@/lib/logger';

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
  const chatInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage: sendAssistantMessage, isLoading: assistantLoading } = useReamAIAssistant();
  const uploadDocument = useUploadDocument();
  const { data: organization } = useCurrentUserOrganization();
  const processDocument = useProcessDocument();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Native DOM keydown listener for Enter to send — more reliable than React synthetic events
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Read value directly from the DOM element to avoid stale closure
        const val = el.value.trim();
        if (val) {
          handleSend();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => el.removeEventListener('keydown', handleKeyDown, { capture: true });
  });

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

            const extractionPromise = Promise.resolve({
              data: await invokeNodeApi<{
                content?: string;
                error?: string;
                warning?: string;
                success?: boolean;
              }>('/api/v1/ai/extract-document-text', {
                method: 'POST',
                body: { documentId: uploadedDoc.id, filePath: uploadedDoc.file_path },
              }),
              error: null,
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
              console.log('RAG processing completed', { documentId: uploadedDoc.id });
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

        toast.success('Document Uploaded', { description: 'The document is ready for chat.' });
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
        toast.error('Upload Failed', { description: errorMessage });
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
      // All Ream AI chat queries go through ream-ai-assistant (plain text responses).
      // Contract Review (/review) uses advanced-contract-analysis separately for structured JSON.
      // Send only the last 12 messages to stay within backend limits and reduce token usage
      const conversationHistory = messages
        .filter((msg) => msg.content.trim().length > 0)
        .slice(-12)
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

      // Final update in case non-streaming path was used
      if (response) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = response;
          }
          return newMessages;
        });
      }

      setIsTyping(false);
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
      toast.error('Error', { description: 'Failed to send message' });
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
        <div className="border-t bg-background safe-area-bottom">
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
            <input
              ref={chatInputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                documentContext || uploadedDocument
                  ? 'Ask about this document or anything...'
                  : 'Ask about cases, clients, documents, or anything...'
              }
              disabled={isTyping || assistantLoading || isUploading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm flex-1"
            />
            <Button
              type="button"
              onClick={() => handleSend()}
              disabled={isTyping || assistantLoading || !input.trim() || isUploading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
