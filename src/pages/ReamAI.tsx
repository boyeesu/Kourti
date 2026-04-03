import React, { useState, useRef, useEffect } from 'react';
import { logError, logWarn } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDropzone } from 'react-dropzone';
import { useVectorSearch } from '@/hooks/useVectorSearch';
import { useRAGSearch, useProcessDocument } from '@/hooks/useRAGSearch';
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments';
import { useContracts } from '@/hooks/useContracts';
import { useEnhancedDocumentAnalysis } from '@/hooks/useEnhancedDocumentAnalysis';
import { useDocumentContent } from '@/hooks/useDocumentContext';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { useReamAIAssistant } from '@/hooks/useReamAIAssistant';
import { ModuleErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';
import { invokeNodeApi, isNodeBackendEnabled } from '@/lib/backendApi';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  Send,
  Loader2,
  StopCircle,
  Sparkles,
  FileText,
  Upload,
  Bot,
  User,
  Menu,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAIConversations, useConversationMessages } from '@/hooks/useAIConversations';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { DocumentSuggestions } from '@/components/DocumentSuggestions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getCachedQuery, setCachedQuery, optimizeConversationHistory } from '@/lib/ai-helpers';
import {
  REAM_AI_EXAMPLE_PROMPTS,
  REAM_AI_QUICK_ACTIONS,
  type QuickAction,
} from '@/components/ream-ai/analysisPresets';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

/** Render AI response with basic markdown formatting */
function FormattedMessage({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: JSX.Element[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-1.5" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold mt-3 mb-1">
          {trimmed.slice(4)}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5 text-primary">
          {trimmed.slice(3)}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold mt-4 mb-1.5">
          {trimmed.slice(2)}
        </h2>
      );
    } else if (/^\*\*(.+?)\*\*\s*$/.test(trimmed)) {
      const match = trimmed.match(/^\*\*(.+?)\*\*\s*$/);
      elements.push(
        <h4 key={i} className="text-sm font-semibold mt-3 mb-1">
          {match?.[1]}
        </h4>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      elements.push(
        <div key={i} className="flex gap-2 ml-1 my-0.5">
          <span className="text-primary/70 mt-0 shrink-0">&#8226;</span>
          <span className="text-sm leading-relaxed">{renderBold(trimmed.slice(2))}</span>
        </div>
      );
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)[.)]\s(.+)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-1 my-0.5">
            <span className="text-primary/70 font-medium text-sm shrink-0 min-w-[1.25rem] text-right">
              {match[1]}.
            </span>
            <span className="text-sm leading-relaxed">{renderBold(match[2])}</span>
          </div>
        );
      }
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed my-0.5">
          {renderBold(trimmed)}
        </p>
      );
    }
  });

  return <>{elements}</>;
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface ReamAIHeaderProps {
  activeDocumentLabel: string | null;
  hasDocumentContext: boolean;
  isBusy: boolean;
  onQuickAction: (action: QuickAction) => void;
  conversationTitle?: string;
  onToggleMobileSidebar?: () => void;
}

function ReamAIHeader({
  activeDocumentLabel,
  hasDocumentContext,
  isBusy,
  onQuickAction,
  conversationTitle,
  onToggleMobileSidebar,
}: ReamAIHeaderProps) {
  const [showQuickActions, setShowQuickActions] = useState(false);

  return (
    <div className="flex items-center justify-between border-b bg-background px-3 py-2 md:px-4 md:py-3">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Mobile menu button */}
        {onToggleMobileSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMobileSidebar}
            className="h-8 w-8 lg:hidden shrink-0"
            title="Open conversation history"
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-sm md:text-base font-semibold truncate">
            {conversationTitle || 'Ream AI'}
          </h1>
        </div>
        {activeDocumentLabel && (
          <Badge variant="secondary" className="text-xs hidden sm:flex shrink-0">
            <FileText className="h-3 w-3 mr-1" />
            <span className="truncate max-w-[100px] md:max-w-[200px]">{activeDocumentLabel}</span>
          </Badge>
        )}
      </div>

      {hasDocumentContext && (
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuickActions(!showQuickActions)}
            className="h-8"
          >
            <Sparkles className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Quick Actions</span>
          </Button>
          {showQuickActions && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-popover p-2 shadow-lg z-50">
              {REAM_AI_QUICK_ACTIONS.map((action) => {
                const disabled = isBusy || (action.requiresDocument && !hasDocumentContext);
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      if (!disabled) {
                        onQuickAction(action);
                        setShowQuickActions(false);
                      }
                    }}
                    disabled={disabled}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                      disabled
                        ? 'cursor-not-allowed opacity-50 text-muted-foreground'
                        : 'hover:bg-accent text-foreground'
                    )}
                  >
                    <action.icon className="h-4 w-4" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReamAI() {
  const [searchParams] = useSearchParams();

  // Conversation management
  const {
    conversations,
    isLoading: conversationsLoading,
    createConversation,
    updateConversation,
    deleteConversation,
  } = useAIConversations();

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const { messages: savedMessages, saveMessage } = useConversationMessages(currentConversationId);

  // State for chat and document selection
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Welcome to Ream AI!',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{
    id: string;
    name?: string;
    title?: string;
    type?: string;
    file_path?: string;
    content?: string;
    terms?: string;
    description?: string;
  } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [enableVectorSearch] = useState(true);
  const [activeQuery, setActiveQuery] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load document from sessionStorage if passed from Documents page (by ID only)
  const handleSelectDocRef = useRef(handleSelectDoc);
  handleSelectDocRef.current = handleSelectDoc;

  // Get current organization for document processing
  const { data: organization } = useCurrentUserOrganization();

  // Fetch documents and contracts
  const { data: documents = [], isLoading: docsLoading } = useDocuments();
  const { data: contractsData, isLoading: contractsLoading } = useContracts();
  const contracts = contractsData?.contracts || [];
  const uploadDocument = useUploadDocument();

  // Load document by ID from sessionStorage (only stores ID, not full content)
  useEffect(() => {
    const docId = sessionStorage.getItem('ream_ai_document_id');
    if (docId && documents.length > 0) {
      const doc = documents.find((d) => d.id === docId);
      if (doc) {
        handleSelectDocRef.current(doc, false);
      }
      sessionStorage.removeItem('ream_ai_document_id');
    }
  }, [documents]);

  // Get document analysis functionality
  const { cancelStreaming, isStreaming } = useEnhancedDocumentAnalysis();

  // Get the same assistant used by the widget for general queries
  const { sendMessage: sendAssistantMessage } = useReamAIAssistant();

  // Document processing for RAG
  const processDocument = useProcessDocument();

  // Get full document content for AI context
  const { data: documentContent } = useDocumentContent(
    selectedDoc?.id || null,
    (selectedDoc?.type as 'document' | 'contract' | null) || null
  );

  // Use RAG search to find relevant document chunks
  const { data: ragResults } = useRAGSearch(
    activeQuery,
    enableVectorSearch && activeQuery.length > 10
  );

  // Use legacy vector search as fallback for broader summaries
  const { data: relevantDocs } = useVectorSearch(
    activeQuery,
    enableVectorSearch && activeQuery.length > 10
  );

  // Load messages from selected conversation
  useEffect(() => {
    if (currentConversationId && savedMessages.length > 0) {
      const formattedMessages: Message[] = savedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
      }));
      setMessages(formattedMessages);
    }
  }, [currentConversationId, savedMessages]);

  // Auto-select contract from URL params
  useEffect(() => {
    const contractId = searchParams.get('contract');
    if (contractId && contracts.length > 0) {
      const contract = contracts.find((c) => c.id === contractId);
      if (contract) {
        handleSelectDoc(contract, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, contracts]);

  // Create initial conversation on mount if none exists
  useEffect(() => {
    if (!conversationsLoading && conversations.length === 0 && !currentConversationId) {
      createConversation.mutate('New Chat', {
        onSuccess: (conv) => setCurrentConversationId(conv.id),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsLoading, conversations.length]);

  // Track which conversations have had their title updated (check actual title from DB)
  const conversationNeedsTitle = (convId: string): boolean => {
    const conv = conversations.find((c) => c.id === convId);
    return !conv || conv.title === 'New Chat';
  };

  // Generate a smart conversation title from the first user message
  const generateConversationTitle = (userMessage: string): string => {
    const cleanMessage = userMessage.trim();
    if (!cleanMessage) return 'New Chat';

    // Remove common prefixes that don't add meaning
    const prefixesToRemove = [
      /^(can you |could you |please |help me |i need to |i want to |i'd like to )/i,
      /^(what is |what are |what's |how do |how does |how can |tell me about )/i,
    ];

    let title = cleanMessage;
    for (const prefix of prefixesToRemove) {
      title = title.replace(prefix, '');
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Remove trailing punctuation for cleaner titles
    title = title.replace(/[?.!]+$/, '');

    // Truncate intelligently at word boundary
    if (title.length > 45) {
      const truncated = title.substring(0, 45);
      const lastSpace = truncated.lastIndexOf(' ');
      title = lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated;
    }

    return title || 'New Chat';
  };

  // Generate title from AI response asynchronously (fire-and-forget)
  const generateSmartTitle = async (convId: string, userMessage: string) => {
    try {
      // Use a short summary prompt via the assistant
      const titlePrompt = `Generate a 3-6 word title for a conversation that started with this question: "${userMessage.substring(0, 200)}". Reply with ONLY the title, no quotes or punctuation.`;
      const titleResponse = await sendAssistantMessage(titlePrompt, []);
      const smartTitle = titleResponse
        .trim()
        .replace(/^["']|["']$/g, '')
        .substring(0, 50);
      if (smartTitle && smartTitle.length > 2 && smartTitle !== 'New Chat') {
        updateConversation.mutate({ id: convId, title: smartTitle });
      }
    } catch {
      // Fallback: use the simple title generation
      const fallbackTitle = generateConversationTitle(userMessage);
      if (fallbackTitle !== 'New Chat') {
        updateConversation.mutate({ id: convId, title: fallbackTitle });
      }
    }
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  };

  // Scroll to bottom of messages when new messages arrive
  useEffect(() => {
    scrollChatToBottom();
  }, [messages]);

  // Handle file uploads - save to database and process
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      const file = acceptedFiles[0];
      setIsExtracting(true);
      setSelectedFile(file);
      setSelectedDoc(null);
      setExtractedContent(null);

      setMessages((msgs) => [
        ...msgs,
        {
          role: 'user',
          content: `I've uploaded "${file.name}" for analysis.`,
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: `Uploading "${file.name}" to your document library...`,
          timestamp: new Date(),
          isStreaming: true,
        },
      ]);

      try {
        // Upload document to database
        const uploadedDoc = await uploadDocument.mutateAsync({
          name: file.name,
          file: file,
          metadata: {
            uploaded_via: 'ream_ai',
            upload_date: new Date().toISOString(),
          },
        });

        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `✅ Document "${file.name}" uploaded successfully! Extracting text content...`,
                  isStreaming: true,
                }
              : msg
          )
        );

        // Extract text content from the uploaded document
        let extractedText = '';
        let extractionError: string | null = null;

        if (uploadedDoc.file_path) {
          try {
            // Try server-side extraction first (handles PDF, DOCX, etc.)
            const extractionResponse = isNodeBackendEnabled()
              ? {
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
                }
              : await invokeFunctionWithCsrf<{
                  content?: string;
                  error?: string;
                  warning?: string;
                  success?: boolean;
                }>('extract-document-text', {
                  body: { documentId: uploadedDoc.id, filePath: uploadedDoc.file_path },
                });

            const extractResult = extractionResponse.data;
            const extractError = extractionResponse.error;

            if (!extractError && extractResult?.content) {
              // Only use extracted text if it's valid (not an error message)
              if (extractResult.content && !extractResult.content.startsWith('[')) {
                extractedText = extractResult.content;
                console.log('Server-side extraction successful, length:', extractedText.length);
              } else {
                extractionError =
                  extractResult.error ||
                  extractResult.warning ||
                  'Extraction yielded no meaningful content';
                logWarn('Server-side extraction returned error/warning', { extractionError });
                if (extractResult.content) {
                  extractedText = extractResult.content; // Still store it for reference
                }
              }
            } else if (extractError) {
              extractionError = extractError.message || 'Extraction failed';
              logError('Server-side extraction error', extractError);
            }
          } catch (extractErr) {
            const errorMsg = extractErr instanceof Error ? extractErr.message : String(extractErr);
            extractionError = errorMsg;
            logError('Text extraction error', extractErr);
          }
        }

        // Try client-side extraction as fallback for simple text files
        if (!extractedText || extractedText.length < 10) {
          if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            try {
              extractedText = await file.text();
              console.log('Client-side text extraction successful, length:', extractedText.length);
            } catch (e) {
              logError('Client-side text extraction failed', e);
              if (!extractionError) {
                extractionError = 'Failed to extract text content';
              }
            }
          }
        }

        setExtractedContent(extractedText || null);

        // Set the uploaded document as selected
        setSelectedDoc({
          id: uploadedDoc.id,
          name: uploadedDoc.name ?? undefined,
          file_path: uploadedDoc.file_path ?? undefined,
          content: extractedText || uploadedDoc.content || undefined,
          type: 'document' as const,
        });
        setSelectedFile(null); // Clear temporary file reference

        // Process document for RAG if we have organization and valid content
        const hasValidContent =
          extractedText && extractedText.length > 50 && !extractedText.startsWith('[');
        if (organization?.id && hasValidContent) {
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content: `🔄 Processing "${file.name}" for AI analysis (chunking and embedding)...`,
                    isStreaming: true,
                  }
                : msg
            )
          );

          try {
            await processDocument.mutateAsync({
              documentId: uploadedDoc.id,
              content: extractedText,
              documentType: 'document',
            });

            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `✅ Successfully processed "${file.name}"! The document has been saved to your library and is ready for analysis. You can now ask questions about it.`,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          } catch (processError) {
            console.error('RAG processing error:', processError);
            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `✅ Document "${file.name}" uploaded and saved! You can now ask questions about it.`,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          }
        } else {
          const hasValidContent =
            extractedText && extractedText.length > 50 && !extractedText.startsWith('[');
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content: hasValidContent
                      ? `✅ Document "${file.name}" uploaded and saved! I've extracted ${extractedText.length.toLocaleString()} characters. You can now ask questions about it.`
                      : `✅ Document "${file.name}" uploaded and saved! ${extractionError ? `Note: ${extractionError}. ` : 'Note: Text extraction was limited. '}You can still ask questions, and I'll help based on available information.`,
                    isStreaming: false,
                  }
                : msg
            )
          );
        }

        setIsExtracting(false);
      } catch (error: unknown) {
        console.error('Upload error:', error);
        setIsExtracting(false);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Failed to upload "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                  isStreaming: false,
                }
              : msg
          )
        );
        toast.error('Upload Failed', {
          description: error instanceof Error ? error.message : 'Failed to upload document.',
        });
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
  });

  // Dropzone is now used for file uploads

  // Handle document/contract selection with content extraction
  async function handleSelectDoc(
    doc: {
      id: string;
      name?: string;
      title?: string;
      file_path?: string;
      content?: string;
      terms?: string;
      description?: string;
    },
    isContract: boolean
  ) {
    setSelectedDoc({ ...doc, type: isContract ? 'contract' : 'document' });
    setSelectedFile(null); // Clear any uploaded file
    setIsDocSelectorOpen(false); // Close the popover

    // Add messages about the selection
    setMessages((msgs) => [
      ...msgs,
      {
        role: 'user',
        content: `I'd like to analyze this ${
          isContract ? 'contract' : 'document'
        }: ${doc.title || doc.name}`,
        timestamp: new Date(),
      },
    ]);

    setMessages((msgs) => [
      ...msgs,
      {
        role: 'assistant',
        content: `I'm processing "${
          doc.title || doc.name
        }" for RAG analysis. This may take a moment...`,
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    let contentToProcess = isContract ? doc.terms || doc.description || '' : doc.content || '';

    // If document has file_path but no content, extract it first
    if (!isContract && doc.file_path && !doc.content) {
      try {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? { ...msg, content: `📄 Extracting text content from "${doc.name}"...` }
              : msg
          )
        );

        const extractionResponse = isNodeBackendEnabled()
          ? {
              data: await invokeNodeApi<{
                content?: string;
                error?: string;
                warning?: string;
                success?: boolean;
              }>('/api/v1/ai/extract-document-text', {
                method: 'POST',
                body: { documentId: doc.id, filePath: doc.file_path },
              }),
              error: null,
            }
          : await invokeFunctionWithCsrf<{
              content?: string;
              error?: string;
              warning?: string;
              success?: boolean;
            }>('extract-document-text', {
              body: { documentId: doc.id, filePath: doc.file_path },
            });

        const extractResult = extractionResponse.data;
        const extractError = extractionResponse.error;

        if (extractError) {
          console.error('Content extraction error:', extractError);
          toast.success('Extraction Warning', {
            description: 'Could not extract text from the file. Analysis may be limited.',
          });
        } else if (extractResult?.content) {
          contentToProcess = extractResult.content;
          // Update doc object for context
          doc.content = extractResult.content;
        }
      } catch {
        // Content extraction failed silently - will use basic analysis
      }
    }

    // Process document for RAG if we have organization context and content
    if (organization?.id && contentToProcess && contentToProcess.length > 50) {
      try {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `🔄 Chunking and embedding "${doc.title || doc.name}" for RAG search...`,
                }
              : msg
          )
        );

        await processDocument.mutateAsync({
          documentId: !isContract ? doc.id : undefined,
          contractId: isContract ? doc.id : undefined,
          content: contentToProcess,
          documentType: isContract ? 'contract' : 'document',
        });

        // Update the message to show processing is complete
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `✅ Successfully processed "${
                    doc.title || doc.name
                  }" for RAG analysis! The document has been chunked and embedded. You can now ask detailed questions about its content.`,
                  isStreaming: false,
                }
              : msg
          )
        );
      } catch (error) {
        console.error('Error processing document:', error);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Loaded "${
                    doc.title || doc.name
                  }" but RAG processing failed. I can still analyze the document, but responses may be less contextual.`,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
    } else {
      const hasContent = contentToProcess && contentToProcess.length > 50;
      setMessages((msgs) =>
        msgs.map((msg, i) =>
          i === msgs.length - 1
            ? {
                ...msg,
                content: hasContent
                  ? `📄 Loaded "${doc.title || doc.name}" for analysis. What would you like to know about it?`
                  : `📄 Document "${doc.title || doc.name}" loaded, but no text content is available. The document may be an image-based PDF requiring OCR. You can still ask questions and I'll help based on available metadata.`,
                isStreaming: false,
              }
            : msg
        )
      );
    }
  }

  // Helper function to manage context window (max ~100k chars for GPT-5.1)
  // Enhanced with smart context management
  function manageContextWindow(content: string, maxLength: number = 80000): string {
    if (content.length <= maxLength) {
      return content;
    }

    // If content is too long, take the beginning and end (most relevant parts)
    const startLength = Math.floor(maxLength * 0.6); // 60% from start
    const endLength = Math.floor(maxLength * 0.4); // 40% from end

    const start = content.substring(0, startLength);
    const end = content.substring(content.length - endLength);

    return `${start}\n\n[... Content truncated for context window management. Showing beginning and end of document ...]\n\n${end}`;
  }

  // Handle sending a message
  async function sendMessage(e?: React.FormEvent, presetMessage?: string) {
    e?.preventDefault();

    const userMessage = (presetMessage ?? input).trim();

    // Only require a message, not a document
    if (!userMessage) {
      return;
    }

    // Check if extraction is still in progress
    if (isExtracting) {
      toast.success('Please wait', {
        description: 'Document extraction is still in progress. Please wait a moment.',
      });
      return;
    }

    setInput('');

    if (userMessage) {
      setActiveQuery(userMessage);
    }

    // Add user message to chat
    if (userMessage) {
      const newUserMessage: Message = {
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      };
      const updatedMessages = [...messages, newUserMessage];
      setMessages(updatedMessages);

      // Save user message to database
      if (currentConversationId) {
        saveMessage.mutate({
          conversationId: currentConversationId,
          role: 'user',
          content: userMessage,
        });
      }

      // Update conversation title on first user message (check actual DB title)
      if (currentConversationId && conversationNeedsTitle(currentConversationId)) {
        // Set a quick title immediately, then refine with AI asynchronously
        const quickTitle = generateConversationTitle(userMessage);
        if (quickTitle !== 'New Chat') {
          updateConversation.mutate({ id: currentConversationId, title: quickTitle });
        }
      }
    }

    // Show typing indicator
    setMessages((msgs) => [
      ...msgs,
      { role: 'assistant', content: '', isStreaming: true, timestamp: new Date() },
    ]);

    try {
      // Check cache first for performance
      const cachedResponse = getCachedQuery(userMessage);
      if (cachedResponse) {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1 ? { ...msg, content: cachedResponse, isStreaming: false } : msg
          )
        );
        setIsTyping(false);
        if (currentConversationId && cachedResponse.trim()) {
          saveMessage.mutate({
            conversationId: currentConversationId,
            role: 'assistant',
            content: cachedResponse,
          });
        }
        return;
      }

      let content: string = '';
      let contextInfo: string = '';

      // Optimize conversation history
      optimizeConversationHistory(messages.map((m) => ({ role: m.role, content: m.content })));

      // Check if we have selected document or relevant documents from RAG/vector search
      if (
        selectedDoc ||
        selectedFile ||
        (ragResults && ragResults.length > 0) ||
        (relevantDocs && (relevantDocs.documents.length > 0 || relevantDocs.contracts.length > 0))
      ) {
        if (selectedDoc && documentContent) {
          // Use the full content from the manually selected document, managing context window
          const fullContent = documentContent.fullContent || '';
          content = manageContextWindow(fullContent);

          // Also include RAG results if available for additional context
          let additionalRAGContext = '';
          if (ragResults && ragResults.length > 0) {
            const topRAGResults = ragResults.slice(0, 5);
            additionalRAGContext = `\n\nADDITIONAL RELEVANT CONTEXT FROM KNOWLEDGE BASE:\n${topRAGResults
              .map(
                (result, i) =>
                  `[SOURCE ${i + 1}] "${result.documentName}" (similarity: ${(result.similarity * 100).toFixed(1)}%):\n${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}`
              )
              .join('\n\n')}`;
          }

          // Add metadata for better context
          contextInfo = `You are currently reviewing a document. ALL questions should be answered using information from this document.

PRIMARY DOCUMENT FOR ANALYSIS:
Document: ${documentContent.type === 'contract' ? documentContent.title : documentContent.name}
Type: ${documentContent.type === 'contract' ? 'Contract' : 'Document'}
${documentContent.contract_type ? `Contract Type: ${documentContent.contract_type}` : ''}
${documentContent.type === 'contract' && documentContent.status ? `Status: ${documentContent.status}` : ''}
${documentContent.value ? `Value: ${documentContent.currency || 'USD'} ${documentContent.value}` : ''}
${documentContent.type === 'contract' && documentContent.start_date ? `Start Date: ${documentContent.start_date}` : ''}
${documentContent.type === 'contract' && documentContent.end_date ? `End Date: ${documentContent.end_date}` : ''}
${documentContent.type === 'document' && documentContent.effective_date ? `Effective Date: ${documentContent.effective_date}` : ''}
${documentContent.type === 'document' && documentContent.termination_date ? `Termination Date: ${documentContent.termination_date}` : ''}
Created: ${
            documentContent.created_at
              ? new Date(documentContent.created_at).toLocaleDateString()
              : 'Unknown'
          }

USER QUESTION: ${userMessage}

DOCUMENT CONTENT:
${content}${additionalRAGContext}

CRITICAL INSTRUCTIONS:
- This question is about the document above. Extract information directly from the document content
- ALL questions when document context is present should be answered using information from that document
- For example: "Who are the parties?" → Find and list the parties mentioned in the document
- "What is the termination clause?" → Find and explain the termination clause from the document
- "What are the key terms?" → Extract and explain key terms from the document
- Base your analysis primarily on the PRIMARY DOCUMENT above
- Use ADDITIONAL RELEVANT CONTEXT to supplement your analysis when relevant
- Cite sources when referencing information from additional context using [SOURCE X] format
- Reference specific sections, clauses, or terms from the document when possible
- If information isn't in the document, say so clearly rather than guessing`;

          // If still no content, provide guidance
          if (!content.trim()) {
            content = `Document "${
              documentContent.type === 'contract' ? documentContent.title : documentContent.name
            }" selected but no text content available. The document may be an uploaded file without extracted text content. You can still ask me questions about this document and I'll help based on the metadata available.`;
          }
        } else if (selectedFile && extractedContent) {
          // Use the extracted content, managing context window
          content = manageContextWindow(extractedContent);
          contextInfo = `You are currently reviewing a document. ALL questions should be answered using information from this document.

Document: ${selectedFile.name}
Type: ${selectedFile.type || 'Unknown'}
Size: ${(selectedFile.size / 1024).toFixed(1)} KB

USER QUESTION: ${userMessage}

DOCUMENT CONTENT:
${extractedContent}

CRITICAL INSTRUCTIONS:
- This question is about the document above. Extract information directly from the document content
- ALL questions when document context is present should be answered using information from that document
- For example: "Who are the parties?" → Find and list the parties mentioned in the document
- "What is the termination clause?" → Find and explain the termination clause from the document
- Reference specific sections, clauses, or terms from the document when possible
- If information isn't in the document, say so clearly rather than guessing`;
        } else if (selectedFile && !extractedContent) {
          // File selected but no content extracted yet
          toast.success('Content not available', {
            description:
              'Please wait for document extraction to complete, or select a different document.',
          });
          return;
        } else if (ragResults && ragResults.length > 0) {
          // Use RAG results for enhanced context with better formatting
          const topResults = ragResults.slice(0, 8); // Use top 8 most relevant chunks

          let contextContent = `I found ${topResults.length} highly relevant document chunks from your knowledge base:\n\n`;

          topResults.forEach((result, i) => {
            contextContent += `[SOURCE ${i + 1}] Document: "${result.documentName}" (Type: ${result.documentType})\n`;
            contextContent += `Similarity Score: ${(result.similarity * 100).toFixed(1)}%\n`;
            contextContent += `Content:\n${result.content}\n\n`;
          });

          contextInfo = `USER QUESTION: "${userMessage}"

RELEVANT KNOWLEDGE BASE CONTENT:
${contextContent}

INSTRUCTIONS:
- Answer the user's question using ONLY the information from the sources above
- Cite sources using [SOURCE X] format when referencing specific information
- Write naturally and conversationally without markdown formatting
- If the question cannot be answered from the provided sources, say so clearly
- Prioritize information from sources with higher similarity scores
- Combine information from multiple sources when relevant`;

          content = contextInfo;
        } else if (
          relevantDocs &&
          (relevantDocs.documents.length > 0 || relevantDocs.contracts.length > 0)
        ) {
          // Use relevant documents found through vector search
          const relevantDocuments = relevantDocs.documents.slice(0, 3);
          const relevantContracts = relevantDocs.contracts.slice(0, 3);

          let contextContent = '';

          if (relevantDocuments.length > 0) {
            contextContent += '\n\nRELEVANT DOCUMENTS:\n';
            relevantDocuments.forEach((doc, i) => {
              contextContent += `\n${i + 1}. ${doc.name}`;
              if (doc.summary) contextContent += `\n   Summary: ${doc.summary}`;
              if (doc.content)
                contextContent += `\n   Content: ${doc.content.substring(
                  0,
                  500
                )}${doc.content.length > 500 ? '...' : ''}`;
              contextContent += `\n   Similarity: ${(doc.similarity * 100).toFixed(1)}%\n`;
            });
          }

          if (relevantContracts.length > 0) {
            contextContent += '\n\nRELEVANT CONTRACTS:\n';
            relevantContracts.forEach((contract, i) => {
              contextContent += `\n${i + 1}. ${contract.title}`;
              if (contract.description)
                contextContent += `\n   Description: ${contract.description}`;
              if (contract.terms)
                contextContent += `\n   Terms: ${contract.terms.substring(
                  0,
                  500
                )}${contract.terms.length > 500 ? '...' : ''}`;
              contextContent += `\n   Similarity: ${(contract.similarity * 100).toFixed(1)}%\n`;
            });
          }

          contextInfo = `Based on your question, I found ${
            relevantDocuments.length + relevantContracts.length
          } relevant documents in your knowledge base:

${contextContent}

Your Question: ${userMessage}

I'll answer based on the relevant information found above.`;

          content = contextInfo;
        }

        // Build conversation history (exclude system message and current message)
        const conversationHistory = messages
          .filter((msg) => msg.role !== 'system')
          .slice(0, -1) // Exclude the current user message
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

        // Use ream-ai-assistant for all Ream AI chat queries (plain text responses).
        // Contract Review (/review) uses advanced-contract-analysis separately for structured JSON.
        const docContent = contextInfo || content;
        const response = await sendAssistantMessage(userMessage, conversationHistory, {
          documentContext: docContent
            ? {
                documentId: selectedDoc?.id,
                documentContent: docContent,
              }
            : undefined,
        });

        // Update message with the response
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1 ? { ...msg, content: response, isStreaming: false } : msg
          )
        );

        setIsTyping(false);

        // Cache the response for future queries
        if (response.trim()) {
          setCachedQuery(userMessage, response);
        }
        // Save assistant message to database
        if (currentConversationId && response.trim()) {
          saveMessage.mutate({
            conversationId: currentConversationId,
            role: 'assistant',
            content: response,
          });
          // Refine conversation title with AI after first response
          if (conversationNeedsTitle(currentConversationId)) {
            generateSmartTitle(currentConversationId, userMessage);
          }
        }
      } else {
        // Handle general legal queries without specific document context
        // Use the SAME assistant as the widget for consistency
        setIsTyping(true);

        try {
          // Build conversation history for general queries (filter out empty messages)
          const conversationHistory = messages
            .filter((msg) => msg.role !== 'system' && msg.content.trim().length > 0)
            .slice(0, -1)
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

          // Use the same ream-ai-assistant as the widget for general queries
          const response = await sendAssistantMessage(userMessage, conversationHistory);

          // Update the message with the response
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1 ? { ...msg, content: response, isStreaming: false } : msg
            )
          );

          setIsTyping(false);

          // Cache the response for future queries
          if (response.trim()) {
            setCachedQuery(userMessage, response);
          }

          // Save assistant message to database
          if (currentConversationId && response.trim()) {
            saveMessage.mutate({
              conversationId: currentConversationId,
              role: 'assistant',
              content: response,
            });
            // Refine conversation title with AI after first response
            if (conversationNeedsTitle(currentConversationId)) {
              generateSmartTitle(currentConversationId, userMessage);
            }
          }
        } catch (error) {
          console.error('Error with general query:', error);
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content:
                      "I'm here to help with legal questions and document analysis. I can answer general legal questions or provide detailed analysis when you select a document. How can I assist you today?",
                    isStreaming: false,
                  }
                : msg
            )
          );
          setIsTyping(false);
        }
      }
    } catch (error) {
      console.error('Error processing request:', error);

      // Show error message
      setMessages((msgs) =>
        msgs.map((msg, i) =>
          i === msgs.length - 1
            ? {
                ...msg,
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                isStreaming: false,
              }
            : msg
        )
      );

      setIsTyping(false);
    }
  }

  // Function to handle adding an example prompt
  function handleExamplePrompt(prompt: string) {
    setInput(prompt);
  }

  const handleQuickAction = (action: QuickAction) => {
    if (isStreaming || isTyping) {
      toast.success('Please wait', {
        description: 'Allow the current analysis to finish before starting a new one.',
      });
      return;
    }

    if (action.requiresDocument && !selectedDoc && !selectedFile) {
      toast.success('Document required', {
        description: 'This action requires a document. Please select or upload a document first.',
      });
      return;
    }

    if (action.requiresDocument && documentContent && !documentContent.fullContent) {
      toast.success('No extracted text', {
        description:
          "This file doesn't have extracted text yet. Try selecting a different document or ask a general question.",
      });
      return;
    }

    void sendMessage(undefined, action.prompt);
  };

  const activeDocumentLabel = selectedDoc
    ? `${selectedDoc.type === 'contract' ? 'Contract' : 'Document'}: ${
        selectedDoc.title || selectedDoc.name
      }`
    : selectedFile
      ? `Uploaded file: ${selectedFile.name}`
      : null;
  const hasDocumentContext = Boolean(selectedDoc || selectedFile);

  // Handle conversation management
  const handleNewConversation = () => {
    const title = 'New Chat';
    createConversation.mutate(title, {
      onSuccess: (conv) => {
        setCurrentConversationId(conv.id);
        setMessages([]);
        setSelectedDoc(null);
        setSelectedFile(null);
        setExtractedContent(null);
      },
    });
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversation.mutate(id, {
      onSuccess: () => {
        if (currentConversationId === id) {
          // If deleting current conversation, create a new one
          handleNewConversation();
        }
      },
    });
  };

  const handleUpdateConversation = (id: string, title: string) => {
    updateConversation.mutate({ id, title });
  };

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Prevent body scroll when on Ream AI page
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close mobile sidebar when conversation is selected
  const handleMobileSelectConversation = (id: string) => {
    handleSelectConversation(id);
    setIsMobileSidebarOpen(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] max-h-[calc(100vh-8rem)] flex-col overflow-hidden lg:flex-row -mx-3 -my-3 sm:-mx-4 lg:-mx-6 lg:-my-4">
      {/* Mobile sidebar toggle - shown only on smaller screens */}
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-0 lg:hidden" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <ModuleErrorBoundary name="Conversation Sidebar">
            <ConversationSidebar
              conversations={conversations}
              currentConversationId={currentConversationId}
              onSelectConversation={handleMobileSelectConversation}
              onNewConversation={() => {
                handleNewConversation();
                setIsMobileSidebarOpen(false);
              }}
              onDeleteConversation={handleDeleteConversation}
              onUpdateConversation={handleUpdateConversation}
              isLoading={conversationsLoading}
            />
          </ModuleErrorBoundary>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden lg:block">
        <ModuleErrorBoundary name="Conversation Sidebar">
          <ConversationSidebar
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
            onUpdateConversation={handleUpdateConversation}
            isLoading={conversationsLoading}
          />
        </ModuleErrorBoundary>
      </div>

      {/* Main content area */}
      <ModuleErrorBoundary name="Chat Interface">
        <main className="flex h-full flex-1 flex-col overflow-hidden bg-background min-w-0">
          {/* Clean header */}
          <ReamAIHeader
            activeDocumentLabel={activeDocumentLabel}
            hasDocumentContext={hasDocumentContext}
            isBusy={isStreaming || isTyping}
            onQuickAction={handleQuickAction}
            conversationTitle={conversations.find((c) => c.id === currentConversationId)?.title}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          />

          {/* Main chat/message area */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* RAG context indicator - subtle */}
            {ragResults && ragResults.length > 0 && (
              <div className="border-b bg-muted/20 px-6 py-2">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    Found {ragResults.length} relevant document{ragResults.length > 1 ? 's' : ''}
                  </span>
                </p>
              </div>
            )}

            {/* Messages area - ChatGPT-like */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
              {messages.length <= 1 ? (
                // Empty state - ChatGPT style
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-2xl w-full px-4 py-8">
                    <div className="flex flex-col items-center justify-center text-center space-y-6">
                      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
                        <p className="text-muted-foreground">
                          Ask me anything about your legal practice, documents, or cases.
                        </p>
                      </div>
                      {hasDocumentContext && (
                        <div className="w-full max-w-md">
                          <p className="text-sm font-medium mb-3">Quick Actions:</p>
                          <div className="grid grid-cols-1 gap-2">
                            {REAM_AI_QUICK_ACTIONS.map((action) => {
                              const disabled =
                                isStreaming ||
                                isTyping ||
                                (action.requiresDocument && !hasDocumentContext);
                              return (
                                <Button
                                  key={action.label}
                                  variant="outline"
                                  className="justify-start h-auto py-3 px-4"
                                  onClick={() => !disabled && handleQuickAction(action)}
                                  disabled={disabled}
                                >
                                  <action.icon className="h-4 w-4 mr-2" />
                                  <div className="text-left">
                                    <div className="font-medium">{action.label}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {action.prompt.substring(0, 60)}...
                                    </div>
                                  </div>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="w-full max-w-md">
                        <p className="text-sm font-medium mb-3">Try asking:</p>
                        <div className="grid grid-cols-1 gap-2">
                          {REAM_AI_EXAMPLE_PROMPTS.map((prompt, i) => (
                            <Button
                              key={i}
                              variant="ghost"
                              className="justify-start h-auto py-2 px-3 text-sm text-left hover:bg-accent"
                              onClick={() => handleExamplePrompt(prompt)}
                            >
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Messages list - ChatGPT style
                <div className="flex flex-col">
                  {messages
                    .filter((msg) => msg.role !== 'system')
                    .map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          'group w-full border-b border-border/40',
                          msg.role === 'user' ? 'bg-muted/30' : 'bg-background'
                        )}
                      >
                        <div className="mx-auto flex max-w-3xl gap-3 md:gap-4 px-3 py-4 md:px-4 md:py-6">
                          {/* Avatar */}
                          <div className="flex-shrink-0">
                            {msg.role === 'user' ? (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <User className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Bot className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          {/* Message content */}
                          <div className="flex-1 min-w-0">
                            <div className="max-w-none">
                              {msg.content ? (
                                msg.role === 'assistant' ? (
                                  <FormattedMessage content={msg.content} />
                                ) : (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                    {msg.content}
                                  </p>
                                )
                              ) : (
                                msg.isStreaming && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="animate-pulse">▋</span>
                                    <span className="text-muted-foreground text-xs">
                                      Thinking...
                                    </span>
                                  </span>
                                )
                              )}
                            </div>
                            {msg.timestamp && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {msg.timestamp.toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Input area - ChatGPT style */}
            <div className="sticky bottom-0 left-0 right-0 z-10 border-t bg-background">
              {/* Document selector and upload - compact */}
              {(selectedDoc || selectedFile || !selectedDoc) && (
                <div className="border-b bg-muted/20 px-4 py-2">
                  <div className="mx-auto flex max-w-3xl items-center gap-2">
                    <Popover open={isDocSelectorOpen} onOpenChange={setIsDocSelectorOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 text-xs">
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          {selectedDoc || selectedFile ? 'Change' : 'Select Document'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[calc(100vw-2rem)] sm:w-[500px] md:w-[600px] p-0"
                        align="start"
                        side="top"
                      >
                        <DocumentSuggestions
                          documents={documents}
                          contracts={contracts}
                          onSelectDocument={handleSelectDoc}
                          isLoading={docsLoading || contractsLoading}
                        />
                      </PopoverContent>
                    </Popover>
                    <div {...getRootProps()} className="flex-1">
                      <input {...getInputProps()} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isExtracting || isStreaming || isTyping}
                      >
                        {isExtracting ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                            Upload
                          </>
                        )}
                      </Button>
                    </div>
                    {selectedDoc && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {selectedDoc.title || selectedDoc.name}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Main input */}
              <form
                onSubmit={(event) => sendMessage(event)}
                className="mx-auto max-w-3xl px-3 py-3 md:px-4 md:py-4 safe-area-bottom"
              >
                <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-background shadow-sm transition-shadow focus-within:shadow-md">
                  <div className="flex-1 p-3">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Message Ream AI..."
                      disabled={isStreaming || isTyping}
                      rows={1}
                      className="min-h-[24px] max-h-[200px] resize-none border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none disabled:opacity-50"
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1 p-2">
                    {isStreaming ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelStreaming}
                      >
                        <StopCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={isTyping || !input.trim()}
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                      >
                        {isTyping ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Ream AI can make mistakes. Check important information.
                </p>
              </form>
            </div>
          </div>
        </main>
      </ModuleErrorBoundary>
    </div>
  );
}
