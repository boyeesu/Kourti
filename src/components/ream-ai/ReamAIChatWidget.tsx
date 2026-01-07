import { useState, useRef, useEffect } from 'react';
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
import { useOrganization } from '@/hooks/useOrganization';
import { useProcessDocument } from '@/hooks/useRAGSearch';

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
      content: 'Hello! I\'m Ream AI, your intelligent legal assistant. I can help you with:\n\n• General legal questions and explanations\n• Information about your cases, clients, and practice data\n• Document review and analysis (upload a file first)\n\nAsk me anything!',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocument, setUploadedDocument] = useState<any | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { streamAnalysis } = useEnhancedDocumentAnalysis();
  const { sendMessage: sendAssistantMessage, isLoading: assistantLoading } = useReamAIAssistant();
  const uploadDocument = useUploadDocument();
  const { data: organization } = useOrganization();
  const processDocument = useProcessDocument();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle document upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length && !isUploading) {
      const file = acceptedFiles[0];
      setIsUploading(true);

      // Add upload message
      setMessages(prev => [...prev, {
        role: 'user',
        content: `Uploading "${file.name}" for analysis...`,
        timestamp: new Date(),
      }]);

      try {
        // Upload document to database
        const uploadedDoc = await uploadDocument.mutateAsync({
          name: file.name,
          file: file,
          metadata: {
            uploaded_via: 'ream_ai_widget',
            upload_date: new Date().toISOString()
          }
        });

        // Extract text content
        let extractedText = '';
        if (uploadedDoc.file_path) {
          try {
            const { data: extractResult, error: extractError } = await supabase.functions.invoke(
              'extract-document-text',
              {
                body: { documentId: uploadedDoc.id, filePath: uploadedDoc.file_path }
              }
            );

            if (!extractError && extractResult?.content) {
              extractedText = extractResult.content;
            }
          } catch (extractErr) {
            console.error('Text extraction error:', extractErr);
          }
        }

        // Try client-side extraction as fallback
        if (!extractedText) {
          if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            extractedText = await file.text();
          }
        }

        // Process for RAG if we have content
        if (organization?.id && extractedText && extractedText.length > 50) {
          try {
            await processDocument.mutateAsync({
              documentId: uploadedDoc.id,
              content: extractedText,
              documentType: "document"
            });
          } catch (processError) {
            console.error("RAG processing error:", processError);
          }
        }

        setUploadedDocument({ ...uploadedDoc, type: 'document', content: extractedText });
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Document "${file.name}" uploaded and processed! You can now ask questions about it.`,
          timestamp: new Date(),
        }]);

        toast({
          title: "Document Uploaded",
          description: "The document has been saved and is ready for analysis.",
        });
      } catch (error: any) {
        console.error('Upload error:', error);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ Failed to upload "${file.name}": ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        }]);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: error.message || "Failed to upload document.",
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"]
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
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }]);

    // Add typing indicator
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }]);

    setIsTyping(true);

    try {
      // Determine if this is a document-specific query or system-wide query
      const activeDocContext = uploadedDocument?.content || documentContext?.content;
      const hasDocumentContext = activeDocContext && activeDocContext.trim().length > 0;
      const isDocumentQuery = hasDocumentContext && (
        userMessage.toLowerCase().includes('review') ||
        userMessage.toLowerCase().includes('analyze') ||
        userMessage.toLowerCase().includes('document') ||
        userMessage.toLowerCase().includes('contract') ||
        userMessage.toLowerCase().includes('clause') ||
        userMessage.toLowerCase().includes('term')
      );

      if (isDocumentQuery && hasDocumentContext) {
        // Use document analysis for document-specific queries
        const docTitle = uploadedDocument?.name || documentContext?.title || 'Uploaded Document';
        const docContent = activeDocContext;
        const analysisPrompt = `Based on the following document context, answer the user's question:\n\nDocument: ${docTitle}\n\n${docContent}\n\nQuestion: ${userMessage}`;

        await streamAnalysis({
          content: analysisPrompt,
          analysisType: 'general',
          onProgress: (content, done) => {
            setMessages(prev => {
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
          .filter(msg => msg.content.trim().length > 0)
          .map(msg => ({
            role: msg.role,
            content: msg.content,
          }));

        const docContext = uploadedDocument?.content || documentContext?.content;
        const response = await sendAssistantMessage(userMessage, conversationHistory, {
          documentContext: docContext ? {
            documentId: uploadedDocument?.id || documentContext?.id,
            documentContent: docContext,
          } : undefined,
        });

        setMessages(prev => {
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
      setMessages(prev => {
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
          'fixed bottom-4 right-4 h-20 w-20 rounded-full shadow-2xl z-50',
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
                fallback.className = 'mascot-fallback w-full h-full flex items-center justify-center bg-primary rounded-full';
                const sparklesIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                sparklesIcon.setAttribute('class', 'h-8 w-8 text-primary-foreground');
                sparklesIcon.setAttribute('fill', 'none');
                sparklesIcon.setAttribute('stroke', 'currentColor');
                sparklesIcon.setAttribute('viewBox', '0 0 24 24');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('d', 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z');
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
    <Card className={cn(
      variant === 'floating' && 'fixed bottom-4 right-4 w-96 h-[600px] shadow-2xl z-50',
      variant === 'embedded' && 'w-full h-full',
      className
    )}>
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onMaximize}
                  className="h-8 w-8"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onMinimize}
                  className="h-8 w-8"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col h-[calc(100%-4rem)] p-0">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.content === '' && isTyping && (
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form onSubmit={handleSend} className="border-t bg-background">
          {/* Upload section - more prominent */}
          <div {...getRootProps()} className={cn(
            "px-4 pt-3 pb-2 border-b",
            isUploading && "bg-muted/50"
          )}>
            <input {...getInputProps()} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(
                "w-full h-9 text-sm font-medium",
                isUploading && "opacity-75 cursor-not-allowed"
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
              placeholder={(documentContext || uploadedDocument) 
                ? "Ask about this document or anything..." 
                : "Ask about cases, clients, documents, or anything..."}
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

