import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Minimize2, Maximize2, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEnhancedDocumentAnalysis } from '@/hooks/useEnhancedDocumentAnalysis';
import { useReamAIAssistant } from '@/hooks/useReamAIAssistant';
import { useToast } from '@/hooks/use-toast';

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
      content: 'Hello! I\'m Ream AI, your intelligent legal assistant. I can help you:\n\n• Query your cases, clients, documents, and contracts\n• Review and analyze documents\n• Answer questions about your practice\n• Provide insights from your data\n\nWhat would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { streamAnalysis } = useEnhancedDocumentAnalysis();
  const { sendMessage: sendAssistantMessage, isLoading: assistantLoading } = useReamAIAssistant();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      const hasDocumentContext = documentContext?.content && documentContext.content.trim().length > 0;
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
        const analysisPrompt = `Based on the following document context, answer the user's question:\n\nDocument: ${documentContext.title}\n\n${documentContext.content}\n\nQuestion: ${userMessage}`;

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
        const conversationHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await sendAssistantMessage(userMessage, conversationHistory, {
          documentContext: documentContext?.content ? {
            documentId: documentContext.id,
            documentContent: documentContext.content,
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
      <Button
        onClick={onMaximize}
        className={cn(
          'fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50',
          className
        )}
        size="icon"
      >
        <Sparkles className="h-5 w-5" />
      </Button>
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
          {documentContext && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              {documentContext.title}
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
        <form onSubmit={handleSend} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cases, clients, documents, or anything..."
              disabled={isTyping || assistantLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isTyping || assistantLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

