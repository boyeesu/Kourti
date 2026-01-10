import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDropzone } from "react-dropzone";
import { useVectorSearch } from "@/hooks/useVectorSearch";
import { useRAGSearch, useProcessDocument } from "@/hooks/useRAGSearch";
import { useDocuments, useUploadDocument } from "@/hooks/useDocuments";
import { useContracts } from "@/hooks/useContracts";
import { useEnhancedDocumentAnalysis } from "@/hooks/useEnhancedDocumentAnalysis";
import { useDocumentContent } from "@/hooks/useDocumentContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useReamAIAssistant } from "@/hooks/useReamAIAssistant";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import {
  Send,
  Loader2,
  StopCircle,
  Sparkles,
  ShieldAlert,
  ListChecks,
  FileText,
  Upload,
  Bot,
  User
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAIConversations, useConversationMessages } from "@/hooks/useAIConversations";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { DocumentSuggestions } from "@/components/DocumentSuggestions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  getCachedQuery,
  setCachedQuery,
  optimizeConversationHistory,
} from '@/lib/ai-helpers';

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

// Example prompts to help users
const EXAMPLE_PROMPTS = [
  "What is a non-disclosure agreement?",
  "Explain the difference between a contract and an agreement",
  "What are common clauses in employment contracts?",
  "How do I protect intellectual property?",
  "What should I look for when reviewing a lease?"
];

type QuickAction = {
  label: string;
  prompt: string;
  requiresDocument?: boolean;
  icon: LucideIcon;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Summarize",
    prompt:
      "Provide an executive summary that highlights the purpose, parties, and the three most important obligations in this document.",
    requiresDocument: true,
    icon: Sparkles
  },
  {
    label: "Risk Review",
    prompt:
      "Identify the top risks, liabilities, or unusual clauses in this document. Explain why they matter and recommend follow-up actions.",
    requiresDocument: true,
    icon: ShieldAlert
  },
  {
    label: "Key Obligations",
    prompt:
      "List all material obligations, deadlines, and compliance requirements in this document with clear bullet points.",
    requiresDocument: true,
    icon: ListChecks
  }
];

interface ReamAIHeaderProps {
  activeDocumentLabel: string | null;
  hasDocumentContext: boolean;
  isBusy: boolean;
  onQuickAction: (action: QuickAction) => void;
  conversationTitle?: string;
}

function ReamAIHeader({
  activeDocumentLabel,
  hasDocumentContext,
  isBusy,
  onQuickAction,
  conversationTitle
}: ReamAIHeaderProps) {
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">
            {conversationTitle || "Ream AI"}
          </h1>
        </div>
        {activeDocumentLabel && (
          <Badge variant="secondary" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            {activeDocumentLabel}
          </Badge>
        )}
      </div>
      
      {hasDocumentContext && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuickActions(!showQuickActions)}
            className="h-8"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Quick Actions
          </Button>
          {showQuickActions && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-popover p-2 shadow-lg z-50">
              {QUICK_ACTIONS.map((action) => {
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
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                      disabled
                        ? "cursor-not-allowed opacity-50 text-muted-foreground"
                        : "hover:bg-accent text-foreground"
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
  const {
    messages: savedMessages,
    saveMessage,
  } = useConversationMessages(currentConversationId);

  // State for chat and document selection
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "Welcome to Ream AI!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; name?: string; title?: string; type?: string; file_path?: string; content?: string; terms?: string; description?: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [enableVectorSearch] = useState(true);
  const [activeQuery, setActiveQuery] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load document from sessionStorage if passed from Documents page
  useEffect(() => {
    const docData = sessionStorage.getItem('ream_ai_document');
    if (docData) {
      try {
        const doc = JSON.parse(docData);
        handleSelectDoc(doc, false);
        sessionStorage.removeItem('ream_ai_document'); // Clear after loading
      } catch (e) {
        console.error('Failed to load document:', e);
      }
    }
  }, []);

  // Get current organization for document processing
  const { data: organization } = useOrganization();

  // Fetch documents and contracts
  const { data: documents = [], isLoading: docsLoading } = useDocuments();
  const { data: contractsData, isLoading: contractsLoading } = useContracts();
  const contracts = contractsData?.contracts || [];
  const uploadDocument = useUploadDocument();

  // Get document analysis functionality
  const { streamAnalysis, cancelStreaming, isStreaming } =
    useEnhancedDocumentAnalysis();
  
  // Get the same assistant used by the widget for general queries
  const { sendMessage: sendAssistantMessage } = useReamAIAssistant();

  // Document processing for RAG
  const processDocument = useProcessDocument();

  // Get full document content for AI context
  const { data: documentContent } = useDocumentContent(
    selectedDoc?.id || null,
    (selectedDoc?.type as "document" | "contract" | null) || null
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
    const contractId = searchParams.get("contract");
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
      createConversation.mutate("New Chat", {
        onSuccess: (conv) => setCurrentConversationId(conv.id),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsLoading, conversations.length]);

  // Track which conversations have had their title updated
  const [titleUpdatedConversations, setTitleUpdatedConversations] = useState<Set<string>>(new Set());

  // Function to generate conversation title from first user message
  const generateConversationTitle = (userMessage: string): string => {
    const cleanMessage = userMessage.trim();
    if (!cleanMessage) return "New Chat";
    
    // Truncate if too long
    if (cleanMessage.length > 50) {
      return cleanMessage.substring(0, 47) + "...";
    }
    return cleanMessage;
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = "smooth") => {
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
          role: "user",
          content: `I've uploaded "${file.name}" for analysis.`,
          timestamp: new Date()
        },
        {
          role: "assistant",
          content: `Uploading "${file.name}" to your document library...`,
          timestamp: new Date(),
          isStreaming: true
        }
      ]);

      try {
        // Upload document to database
        const uploadedDoc = await uploadDocument.mutateAsync({
          name: file.name,
          file: file,
          metadata: {
            uploaded_via: 'ream_ai',
            upload_date: new Date().toISOString()
          }
        });

        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `✅ Document "${file.name}" uploaded successfully! Extracting text content...`,
                  isStreaming: true
                }
              : msg
          )
        );

        // Extract text content from the uploaded document
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

        setExtractedContent(extractedText);
        
        // Set the uploaded document as selected
        setSelectedDoc({ 
          id: uploadedDoc.id, 
          name: uploadedDoc.name ?? undefined,
          file_path: uploadedDoc.file_path ?? undefined,
          content: uploadedDoc.content ?? undefined,
          type: 'document' as const 
        });
        setSelectedFile(null); // Clear temporary file reference

        // Process document for RAG if we have organization and content
        if (organization?.id && extractedText && extractedText.length > 50) {
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content: `🔄 Processing "${file.name}" for AI analysis (chunking and embedding)...`,
                    isStreaming: true
                  }
                : msg
            )
          );

          try {
            await processDocument.mutateAsync({
              documentId: uploadedDoc.id,
              content: extractedText,
              documentType: "document"
            });

            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `✅ Successfully processed "${file.name}"! The document has been saved to your library and is ready for analysis. You can now ask questions about it.`,
                      isStreaming: false
                    }
                  : msg
              )
            );
          } catch (processError) {
            console.error("RAG processing error:", processError);
            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `✅ Document "${file.name}" uploaded and saved! You can now ask questions about it.`,
                      isStreaming: false
                    }
                  : msg
              )
            );
          }
        } else {
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content: extractedText
                      ? `✅ Document "${file.name}" uploaded and saved! You can now ask questions about it.`
                      : `✅ Document "${file.name}" uploaded and saved! Note: Text extraction was limited. You can still ask questions, and I'll help based on available information.`,
                    isStreaming: false
                  }
                : msg
            )
          );
        }

        setIsExtracting(false);
      } catch (error: any) {
        console.error('Upload error:', error);
        setIsExtracting(false);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Failed to upload "${file.name}": ${error.message || 'Unknown error'}. Please try again.`,
                  isStreaming: false
                }
              : msg
          )
        );
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: error.message || "Failed to upload document.",
        });
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "text/plain": [".txt"]
    },
    noClick: false,
    noDrag: false,
  });

  // Dropzone is now used for file uploads

  // Handle document/contract selection with content extraction
  async function handleSelectDoc(doc: { id: string; name?: string; title?: string; file_path?: string; content?: string; terms?: string; description?: string }, isContract: boolean) {
    setSelectedDoc({ ...doc, type: isContract ? "contract" : "document" });
    setSelectedFile(null); // Clear any uploaded file
    setIsDocSelectorOpen(false); // Close the popover

    // Add messages about the selection
    setMessages((msgs) => [
      ...msgs,
      {
        role: "user",
        content: `I'd like to analyze this ${
          isContract ? "contract" : "document"
        }: ${doc.title || doc.name}`,
        timestamp: new Date()
      }
    ]);

    setMessages((msgs) => [
      ...msgs,
      {
        role: "assistant",
        content: `I'm processing "${
          doc.title || doc.name
        }" for RAG analysis. This may take a moment...`,
        timestamp: new Date(),
        isStreaming: true
      }
    ]);

    let contentToProcess = isContract 
      ? (doc.terms || doc.description || "") 
      : (doc.content || "");

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

        const { data: extractResult, error: extractError } = await supabase.functions.invoke(
          'extract-document-text',
          {
            body: { documentId: doc.id, filePath: doc.file_path }
          }
        );

        if (extractError) {
          console.error('Content extraction error:', extractError);
          toast({
            title: "Extraction Warning",
            description: "Could not extract text from the file. Analysis may be limited.",
            variant: "default"
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
              ? { ...msg, content: `🔄 Chunking and embedding "${doc.title || doc.name}" for RAG search...` }
              : msg
          )
        );

        await processDocument.mutateAsync({
          documentId: !isContract ? doc.id : undefined,
          contractId: isContract ? doc.id : undefined,
          content: contentToProcess,
          documentType: isContract ? "contract" : "document"
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
                  isStreaming: false
                }
              : msg
          )
        );
      } catch (error) {
        console.error("Error processing document:", error);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Loaded "${
                    doc.title || doc.name
                  }" but RAG processing failed. I can still analyze the document, but responses may be less contextual.`,
                  isStreaming: false
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
                isStreaming: false
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
      toast({
        title: "Please wait",
        description: "Document extraction is still in progress. Please wait a moment.",
        variant: "default"
      });
      return;
    }

    setInput("");

    if (userMessage) {
      setActiveQuery(userMessage);
    }

      // Add user message to chat
      if (userMessage) {
        const newUserMessage: Message = { 
          role: "user", 
          content: userMessage, 
          timestamp: new Date() 
        };
        const updatedMessages = [...messages, newUserMessage];
        setMessages(updatedMessages);
        
        // Save user message to database
        if (currentConversationId) {
          saveMessage.mutate({
            conversationId: currentConversationId,
            role: "user",
            content: userMessage,
          });
        }

        // Update conversation title on first user message (if not already updated)
        if (currentConversationId && !titleUpdatedConversations.has(currentConversationId)) {
          const title = generateConversationTitle(userMessage);
          if (title !== "New Chat") {
            updateConversation.mutate({ 
              id: currentConversationId, 
              title: title 
            });
            setTitleUpdatedConversations(prev => new Set(prev).add(currentConversationId));
          }
        }
      }

    // Show typing indicator
    setMessages((msgs) => [
      ...msgs,
      { role: "assistant", content: "", isStreaming: true, timestamp: new Date() }
    ]);

    try {
      // Check cache first for performance
      const cachedResponse = getCachedQuery(userMessage);
      if (cachedResponse) {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? { ...msg, content: cachedResponse, isStreaming: false }
              : msg
          )
        );
        setIsTyping(false);
        if (currentConversationId && cachedResponse.trim()) {
          saveMessage.mutate({
            conversationId: currentConversationId,
            role: "assistant",
            content: cachedResponse,
          });
        }
        return;
      }

      let content: string = "";
      let contextInfo: string = "";

      // Optimize conversation history
      optimizeConversationHistory(
        messages.map(m => ({ role: m.role, content: m.content }))
      );

      // Check if we have selected document or relevant documents from RAG/vector search
      if (
        selectedDoc ||
        selectedFile ||
        (ragResults && ragResults.length > 0) ||
        (relevantDocs &&
          (relevantDocs.documents.length > 0 ||
            relevantDocs.contracts.length > 0))
      ) {
        if (selectedDoc && documentContent) {
          // Use the full content from the manually selected document, managing context window
          const fullContent = documentContent.fullContent || "";
          content = manageContextWindow(fullContent);

          // Also include RAG results if available for additional context
          let additionalRAGContext = "";
          if (ragResults && ragResults.length > 0) {
            const topRAGResults = ragResults.slice(0, 5);
            additionalRAGContext = `\n\nADDITIONAL RELEVANT CONTEXT FROM KNOWLEDGE BASE:\n${topRAGResults.map((result, i) => 
              `[SOURCE ${i + 1}] "${result.documentName}" (similarity: ${(result.similarity * 100).toFixed(1)}%):\n${result.content.substring(0, 500)}${result.content.length > 500 ? "..." : ""}`
            ).join("\n\n")}`;
          }

          // Add metadata for better context
          contextInfo = `You are currently reviewing a document. ALL questions should be answered using information from this document.

PRIMARY DOCUMENT FOR ANALYSIS:
Document: ${
            documentContent.type === "contract"
              ? documentContent.title
              : documentContent.name
          }
Type: ${documentContent.type === "contract" ? "Contract" : "Document"}
${documentContent.contract_type ? `Contract Type: ${documentContent.contract_type}` : ""}
${documentContent.type === "contract" && documentContent.status ? `Status: ${documentContent.status}` : ""}
${documentContent.value ? `Value: ${documentContent.currency || "USD"} ${documentContent.value}` : ""}
${documentContent.type === "contract" && documentContent.start_date ? `Start Date: ${documentContent.start_date}` : ""}
${documentContent.type === "contract" && documentContent.end_date ? `End Date: ${documentContent.end_date}` : ""}
${documentContent.type === "document" && documentContent.effective_date ? `Effective Date: ${documentContent.effective_date}` : ""}
${documentContent.type === "document" && documentContent.termination_date ? `Termination Date: ${documentContent.termination_date}` : ""}
Created: ${
            documentContent.created_at
              ? new Date(documentContent.created_at).toLocaleDateString()
              : "Unknown"
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
              documentContent.type === "contract"
                ? documentContent.title
                : documentContent.name
            }" selected but no text content available. The document may be an uploaded file without extracted text content. You can still ask me questions about this document and I'll help based on the metadata available.`;
          }
        } else if (selectedFile && extractedContent) {
          // Use the extracted content, managing context window
          content = manageContextWindow(extractedContent);
          contextInfo = `You are currently reviewing a document. ALL questions should be answered using information from this document.

Document: ${selectedFile.name}
Type: ${selectedFile.type || "Unknown"}
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
          toast({
            title: "Content not available",
            description: "Please wait for document extraction to complete, or select a different document.",
            variant: "default"
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
          (relevantDocs.documents.length > 0 ||
            relevantDocs.contracts.length > 0)
        ) {
          // Use relevant documents found through vector search
          const relevantDocuments = relevantDocs.documents.slice(0, 3);
          const relevantContracts = relevantDocs.contracts.slice(0, 3);

          let contextContent = "";

          if (relevantDocuments.length > 0) {
            contextContent += "\n\nRELEVANT DOCUMENTS:\n";
            relevantDocuments.forEach((doc, i) => {
              contextContent += `\n${i + 1}. ${doc.name}`;
              if (doc.summary) contextContent += `\n   Summary: ${doc.summary}`;
              if (doc.content)
                contextContent += `\n   Content: ${doc.content.substring(
                  0,
                  500
                )}${doc.content.length > 500 ? "..." : ""}`;
              contextContent += `\n   Similarity: ${(doc.similarity * 100).toFixed(
                1
              )}%\n`;
            });
          }

          if (relevantContracts.length > 0) {
            contextContent += "\n\nRELEVANT CONTRACTS:\n";
            relevantContracts.forEach((contract, i) => {
              contextContent += `\n${i + 1}. ${contract.title}`;
              if (contract.description)
                contextContent += `\n   Description: ${contract.description}`;
              if (contract.terms)
                contextContent += `\n   Terms: ${contract.terms.substring(
                  0,
                  500
                )}${contract.terms.length > 500 ? "..." : ""}`;
              contextContent += `\n   Similarity: ${(contract.similarity * 100).toFixed(
                1
              )}%\n`;
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

        // Build RAG context if we have RAG results
        let ragContextString = "";
        if (ragResults && ragResults.length > 0 && !selectedDoc) {
          const topRAGResults = ragResults.slice(0, 8);
          ragContextString = topRAGResults.map((result, i) => 
            `[SOURCE ${i + 1}] "${result.documentName}" (${result.documentType}, similarity: ${(result.similarity * 100).toFixed(1)}%):\n${result.content}`
          ).join("\n\n");
        }

        // Build conversation history (exclude system message and current message)
        const conversationHistory = messages
          .filter(msg => msg.role !== "system")
          .slice(0, -1) // Exclude the current user message
          .map(msg => ({
            role: msg.role,
            content: msg.content
          }));

        // Stream the AI analysis with enhanced context
        await streamAnalysis({
          content: contextInfo || content,
          analysisType: userMessage.toLowerCase().includes("risk")
            ? "risk"
            : userMessage.toLowerCase().includes("extract") ||
              userMessage.toLowerCase().includes("key")
            ? "extract"
            : userMessage.toLowerCase().includes("compare")
            ? "compare"
            : userMessage.toLowerCase().includes("summary") ||
              userMessage.toLowerCase().includes("summarize")
            ? "summary"
            : "general",
          conversationHistory: conversationHistory,
          ragContext: ragContextString || undefined,
          onProgress: (aiContent, done) => {
            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? { ...msg, content: aiContent, isStreaming: !done }
                  : msg
              )
            );

            if (done) {
              setIsTyping(false);
              // Cache the response for future queries
              if (aiContent.trim()) {
                setCachedQuery(userMessage, aiContent);
              }
              // Save assistant message to database
              if (currentConversationId && aiContent.trim()) {
                saveMessage.mutate({
                  conversationId: currentConversationId,
                  role: "assistant",
                  content: aiContent,
                });

              }
            }
          }
        });
      } else {
        // Handle general legal queries without specific document context
        // Use the SAME assistant as the widget for consistency
        setIsTyping(true);

        try {
          // Build conversation history for general queries (filter out empty messages)
          const conversationHistory = messages
            .filter(msg => msg.role !== "system" && msg.content.trim().length > 0)
            .slice(0, -1)
            .map(msg => ({
              role: msg.role,
              content: msg.content
            }));

          // Use the same ream-ai-assistant as the widget for general queries
          const response = await sendAssistantMessage(userMessage, conversationHistory);

          // Update the message with the response
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? { ...msg, content: response, isStreaming: false }
                : msg
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
              role: "assistant",
              content: response,
            });
          }
        } catch (error) {
          console.error("Error with general query:", error);
          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? { ...msg, content: "I'm here to help with legal questions and document analysis. I can answer general legal questions or provide detailed analysis when you select a document. How can I assist you today?", isStreaming: false }
                : msg
            )
          );
          setIsTyping(false);
        }
      }
    } catch (error) {
      console.error("Error processing request:", error);

      // Show error message
      setMessages((msgs) =>
        msgs.map((msg, i) =>
          i === msgs.length - 1
            ? {
                ...msg,
                content:
                  "Sorry, I encountered an error processing your request. Please try again.",
                isStreaming: false
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
      toast({
        title: "Please wait",
        description:
          "Allow the current analysis to finish before starting a new one."
      });
      return;
    }

    if (action.requiresDocument && !selectedDoc && !selectedFile) {
      toast({
        title: "Document required",
        description:
          "This action requires a document. Please select or upload a document first."
      });
      return;
    }

    if (action.requiresDocument && documentContent && !documentContent.fullContent) {
      toast({
        title: "No extracted text",
        description:
          "This file doesn't have extracted text yet. Try selecting a different document or ask a general question."
      });
      return;
    }

    void sendMessage(undefined, action.prompt);
  };

  const activeDocumentLabel = selectedDoc
    ? `${selectedDoc.type === "contract" ? "Contract" : "Document"}: ${
        selectedDoc.title || selectedDoc.name
      }`
    : selectedFile
    ? `Uploaded file: ${selectedFile.name}`
    : null;
  const hasDocumentContext = Boolean(selectedDoc || selectedFile);

  // Handle conversation management
  const handleNewConversation = () => {
    const title = "New Chat";
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

  // Prevent body scroll when on Ream AI page
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)] max-h-[calc(100vh-8rem)] flex-col overflow-hidden lg:flex-row -mx-3 -my-3 sm:-mx-4 lg:-mx-6 lg:-my-4">
      {/* Left: Conversation History */}
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

      {/* Main content area */}
      <ModuleErrorBoundary name="Chat Interface">
        <main className="flex h-full flex-1 flex-col overflow-hidden bg-background min-w-0">
          {/* Clean header */}
          <ReamAIHeader
            activeDocumentLabel={activeDocumentLabel}
            hasDocumentContext={hasDocumentContext}
            isBusy={isStreaming || isTyping}
            onQuickAction={handleQuickAction}
            conversationTitle={conversations.find(c => c.id === currentConversationId)?.title}
          />

          {/* Main chat/message area */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* RAG context indicator - subtle */}
            {ragResults && ragResults.length > 0 && (
              <div className="border-b bg-muted/20 px-6 py-2">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>Found {ragResults.length} relevant document{ragResults.length > 1 ? 's' : ''}</span>
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
                            {QUICK_ACTIONS.map((action) => {
                              const disabled = isStreaming || isTyping || (action.requiresDocument && !hasDocumentContext);
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
                          {EXAMPLE_PROMPTS.map((prompt, i) => (
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
                    .filter(msg => msg.role !== "system")
                    .map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          "group w-full border-b border-border/40",
                          msg.role === "user" ? "bg-muted/30" : "bg-background"
                        )}
                      >
                        <div className="mx-auto flex max-w-3xl gap-4 px-4 py-6">
                          {/* Avatar */}
                          <div className="flex-shrink-0">
                            {msg.role === "user" ? (
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
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {msg.content || (msg.isStreaming && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="animate-pulse">▋</span>
                                    <span className="text-muted-foreground text-xs">Thinking...</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {msg.timestamp && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {msg.timestamp.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit"
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
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          {selectedDoc || selectedFile ? "Change" : "Select Document"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[600px] p-0" 
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
                className="mx-auto max-w-3xl px-4 py-4"
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
                        target.style.height = "auto";
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
