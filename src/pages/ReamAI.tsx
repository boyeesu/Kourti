import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDropzone } from "react-dropzone";
import { useVectorSearch } from "@/hooks/useVectorSearch";
import { useRAGSearch, useProcessDocument } from "@/hooks/useRAGSearch";
import { useDocuments } from "@/hooks/useDocuments";
import { useContracts } from "@/hooks/useContracts";
import { useEnhancedDocumentAnalysis } from "@/hooks/useEnhancedDocumentAnalysis";
import { useDocumentContent } from "@/hooks/useDocumentContext";
import { useOrganization } from "@/hooks/useOrganization";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import {
  Send,
  Loader2,
  StopCircle,
  Sparkles,
  ShieldAlert,
  ListChecks,
  ChevronRight,
  FileText
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAIConversations, useConversationMessages } from "@/hooks/useAIConversations";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { DocumentSuggestions } from "@/components/DocumentSuggestions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

// Example prompts to help users
const EXAMPLE_PROMPTS = [
  "Summarize this document in 3 paragraphs",
  "What are the key provisions in this contract?",
  "Identify potential risks in this agreement",
  "Extract all dates and deadlines from this document",
  "Is there anything unusual about this contract?"
];

type QuickAction = {
  label: string;
  prompt: string;
  requiresDocument?: boolean;
  icon: LucideIcon;
};

type SendMessageOptions = {
  overrideDocumentContent?: string;
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
  },
  {
    label: "Draft Follow-up Email",
    prompt:
      "Draft a professional follow-up email summarizing the current findings and next steps for the client.",
    requiresDocument: false,
    icon: Send
  }
];

interface ReamAIHeaderProps {
  activeDocumentLabel: string | null;
  hasDocumentContext: boolean;
  documentContent: any;
  isBusy: boolean;
  onQuickAction: (action: QuickAction) => void | Promise<void>;
}

function ReamAIHeader({
  activeDocumentLabel,
  hasDocumentContext,
  documentContent,
  isBusy,
  onQuickAction
}: ReamAIHeaderProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const breadcrumbs = ["Workspace", "Ream AI"];
  if (activeDocumentLabel) {
    breadcrumbs.push(activeDocumentLabel);
  }

  const metadataChips: React.ReactNode[] = [];
  if (documentContent?.contract_type) {
    metadataChips.push(
      <Badge key="contract_type" variant="secondary" className="text-[10px]">
        {documentContent.contract_type}
      </Badge>
    );
  }
  if (documentContent?.type === "contract" && documentContent.status) {
    metadataChips.push(
      <Badge key="status" variant="secondary" className="text-[10px]">
        Status: {documentContent.status}
      </Badge>
    );
  }
  if (documentContent?.value) {
    metadataChips.push(
      <span key="value" className="text-xs text-muted-foreground">
        Value: {documentContent.currency || "USD"} {documentContent.value}
      </span>
    );
  }
  if (documentContent?.type === "document" && documentContent.effective_date) {
    metadataChips.push(
      <span key="effective" className="text-xs text-muted-foreground">
        Effective: {formatDate(documentContent.effective_date)}
      </span>
    );
  }
  if (documentContent?.type === "document" && documentContent.termination_date) {
    metadataChips.push(
      <span key="termination" className="text-xs text-muted-foreground">
        Termination: {formatDate(documentContent.termination_date)}
      </span>
    );
  }
  if (documentContent?.type === "contract" && documentContent.start_date) {
    metadataChips.push(
      <span key="start" className="text-xs text-muted-foreground">
        Start: {formatDate(documentContent.start_date)}
      </span>
    );
  }
  if (documentContent?.type === "contract" && documentContent.end_date) {
    metadataChips.push(
      <span key="end" className="text-xs text-muted-foreground">
        Ends: {formatDate(documentContent.end_date)}
      </span>
    );
  }

  const handleSelect = (action: QuickAction) => {
    if (isBusy) return;
    if (action.requiresDocument && !hasDocumentContext) return;

    setSelectedAction(action.label);
    void onQuickAction(action);
    setTimeout(() => setSelectedAction(null), 250);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb}-${index}`}>
              {index > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              <span
                className={cn(
                  "truncate",
                  index === breadcrumbs.length - 1
                    ? "text-foreground font-medium"
                    : ""
                )}
              >
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Ream AI</h1>
          <Badge
            variant="outline"
            className="text-[11px] font-normal uppercase tracking-wide"
          >
            Beta
          </Badge>
        </div>
        {metadataChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {metadataChips}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div
          className="inline-flex flex-wrap overflow-hidden rounded-md border border-border bg-background text-xs"
          role="group"
          aria-label="Quick analysis shortcuts"
        >
          {QUICK_ACTIONS.map((action, idx) => {
            const disabled =
              isBusy || (action.requiresDocument && !hasDocumentContext);
            const isActive = selectedAction === action.label;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => handleSelect(action)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 transition-colors",
                  idx !== 0 && "border-l border-border/60",
                  disabled && "cursor-not-allowed opacity-50",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/70"
                )}
                title={
                  disabled && action.requiresDocument
                    ? "Select a document to enable"
                    : undefined
                }
              >
                <action.icon className="h-3.5 w-3.5" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReamAI() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

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
        "Welcome to Ream AI with RAG! Select or upload a document/contract, and I'll process it for intelligent retrieval. Your documents will be chunked and embedded for better context-aware responses.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [enableVectorSearch] = useState(true);
  const [activeQuery, setActiveQuery] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const runExtractionForDocument = useCallback(
    async ({
      doc,
      isContract,
      filePath,
    }: {
      doc: any;
      isContract: boolean;
      filePath?: string | null;
    }) => {
      const documentType = isContract ? "contract" : "document";
      const resolvedFilePath = filePath || doc?.file_path;

      if (!resolvedFilePath) {
        throw new Error("Document is missing a file path for extraction");
      }

      const { data, error } = await supabase.functions.invoke(
        "extract-document-text",
        {
          body: {
            documentId: !isContract ? doc.id : undefined,
            contractId: isContract ? doc.id : undefined,
            filePath: resolvedFilePath,
            documentType,
          },
        }
      );

      if (error) {
        throw new Error(error.message || "Failed to extract document text");
      }

      const extractedText: string =
        data?.text ||
        data?.content ||
        data?.fullContent ||
        data?.extractedText ||
        "";

      if (!extractedText?.trim()) {
        return "";
      }

      if (isContract) {
        const { error: updateError } = await supabase
          .from("contracts")
          .update({
            terms: extractedText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.id);

        if (updateError) {
          console.error("Failed to persist extracted contract text:", updateError);
        }
      } else {
        const { error: updateError } = await supabase
          .from("documents")
          .update({
            content: extractedText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.id);

        if (updateError) {
          console.error("Failed to persist extracted document text:", updateError);
        }
      }

      queryClient.setQueryData(
        ["document-content", doc.id, documentType],
        (existing: any) => ({
          ...(existing || {}),
          ...doc,
          file_path: resolvedFilePath,
          ...(isContract
            ? { terms: extractedText }
            : { content: extractedText }),
          fullContent: extractedText,
          type: documentType,
        })
      );

      if (!isContract) {
        queryClient.setQueryData(["documents"], (existing: any) => {
          if (!Array.isArray(existing)) return existing;
          return existing.map((item: any) =>
            item.id === doc.id ? { ...item, content: extractedText } : item
          );
        });

        queryClient.setQueryData(["document", doc.id], (existing: any) =>
          existing ? { ...existing, content: extractedText } : existing
        );
      } else {
        queryClient.setQueryData(["contract", doc.id], (existing: any) =>
          existing ? { ...existing, terms: extractedText } : existing
        );

        void queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && query.queryKey[0] === "contracts",
        });
      }

      return extractedText;
    },
    [queryClient]
  );

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

  // Get document analysis functionality
  const { streamAnalysis, cancelStreaming, isStreaming } =
    useEnhancedDocumentAnalysis();

  // Document processing for RAG
  const processDocument = useProcessDocument();

  // Get full document content for AI context
  const { data: documentContent } = useDocumentContent(
    selectedDoc?.id || null,
    selectedDoc?.type || null
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

  // Handle file uploads with extraction
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      setSelectedDoc(null);
      setExtractedContent(null);
      setIsExtracting(true);

      setMessages((msgs) => [
        ...msgs,
        {
          role: "user",
          content: `I've uploaded "${file.name}" for analysis.`,
          timestamp: new Date()
        },
        {
          role: "assistant",
          content: `Extracting content from "${file.name}"... Please wait while I process the document.`,
          timestamp: new Date(),
          isStreaming: true
        }
      ]);

      // Extract content based on file type
      try {
        let content = '';
        
        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          content = await file.text();
        } else if (file.type === 'application/pdf') {
          // For PDFs, inform user that extraction is limited
          content = `PDF file uploaded: ${file.name}. For best results with PDF analysis, please select a document from the knowledge base that has already been processed, or describe the content you'd like to analyze.`;
        } else if (
          file.type === 'application/msword' ||
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          // Basic text extraction for Word docs
          try {
            content = await file.text();
          } catch {
            content = `Document uploaded: ${file.name}. Unable to extract text automatically. Please describe the content or use a text-based format.`;
          }
        } else {
          content = `File uploaded: ${file.name}. Please describe what you'd like to know about this document.`;
        }

        setExtractedContent(content);
        setIsExtracting(false);

        // Update the last message
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: content.includes('uploaded:') || content.includes('PDF file')
                    ? content
                    : `✅ Successfully extracted content from "${file.name}". You can now ask questions about the document.`,
                  isStreaming: false
                }
              : msg
          )
        );
      } catch (error) {
        console.error('Extraction error:', error);
        setIsExtracting(false);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Could not extract content from "${file.name}". Please try a text-based document or describe what you need help with.`,
                  isStreaming: false
                }
              : msg
          )
        );
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "text/plain": [".txt"]
    },
    noClick: true,
    noDrag: true,
  });

  // Avoid warning for unused variables - they're needed for dropzone setup
  void getRootProps;
  void getInputProps;
  void isDragActive;

  // Handle document/contract selection
  async function handleSelectDoc(doc: any, isContract: boolean) {
    const documentType = isContract ? "contract" : "document";
    const documentName = doc.title || doc.name || "Document";
    let processingMessageUpdated = false;

    setSelectedDoc({ ...doc, type: documentType });
    setSelectedFile(null);
    setIsDocSelectorOpen(false);

    // Add messages about the selection
    setMessages((msgs) => [
      ...msgs,
      {
        role: "user",
        content: `I'd like to analyze this ${documentType}: ${documentName}`,
        timestamp: new Date(),
      },
      {
        role: "assistant",
        content: `I'm processing "${documentName}" for RAG analysis. This may take a moment as I chunk and embed the content for better retrieval...`,
        timestamp: new Date(),
      },
    ]);

    let workingDoc = { ...doc, type: documentType };
    let contentForProcessing = isContract
      ? doc.terms || doc.description || ""
      : doc.content || doc.summary || doc.terms || "";

    const isPdfDocument = Boolean(
      (doc.mime_type && doc.mime_type.toLowerCase().includes("pdf")) ||
        (doc.file_path && doc.file_path.toLowerCase().endsWith(".pdf"))
    );
    const needsExtraction = isPdfDocument && !contentForProcessing?.trim();

    if (needsExtraction) {
      if (doc.file_path) {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `I'm extracting text from "${documentName}" before processing it for RAG analysis...`,
                }
              : msg
          )
        );

        try {
          setIsExtracting(true);
          const extractedText = await runExtractionForDocument({
            doc,
            isContract,
            filePath: doc.file_path,
          });

          if (extractedText) {
            contentForProcessing = extractedText;
            workingDoc = isContract
              ? { ...workingDoc, terms: extractedText }
              : { ...workingDoc, content: extractedText };

            setSelectedDoc({ ...workingDoc, type: documentType });

            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `✅ Successfully extracted text from "${documentName}". Processing the document for RAG analysis...`,
                    }
                  : msg
              )
            );
            processingMessageUpdated = true;
          } else {
            setMessages((msgs) =>
              msgs.map((msg, i) =>
                i === msgs.length - 1
                  ? {
                      ...msg,
                      content: `⚠️ I couldn't extract readable text from "${documentName}". I'll continue with limited metadata.`,
                    }
                  : msg
              )
            );
            processingMessageUpdated = true;
          }
        } catch (error) {
          console.error("Error extracting document text:", error);
          toast({
            variant: "destructive",
            title: "Extraction failed",
            description:
              "We couldn't extract text from this PDF. You can still continue, but responses may be limited to metadata.",
          });

          setMessages((msgs) =>
            msgs.map((msg, i) =>
              i === msgs.length - 1
                ? {
                    ...msg,
                    content: `⚠️ Extraction failed for "${documentName}". I'll continue with limited metadata.`,
                  }
                : msg
            )
          );
          processingMessageUpdated = true;
        } finally {
          setIsExtracting(false);
        }
      } else {
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ I couldn't locate the original file for "${documentName}" to extract its text. I'll continue with limited metadata.`,
                }
              : msg
          )
        );
        processingMessageUpdated = true;
      }
    }

    const hasProcessableContent = Boolean(contentForProcessing?.trim());

    if (organization?.id && hasProcessableContent) {
      try {
        await processDocument.mutateAsync({
          documentId: !isContract ? doc.id : undefined,
          contractId: isContract ? doc.id : undefined,
          content: contentForProcessing,
          documentType,
        });

        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `✅ Successfully processed "${documentName}" for RAG analysis! The document has been chunked and embedded. You can now ask detailed questions about its content.`,
                }
              : msg
          )
        );
        processingMessageUpdated = true;
      } catch (error) {
        console.error("Error processing document:", error);
        setMessages((msgs) =>
          msgs.map((msg, i) =>
            i === msgs.length - 1
              ? {
                  ...msg,
                  content: `⚠️ Loaded "${documentName}" but RAG processing failed. I can still analyze the document, but responses may be less contextual.`,
                }
              : msg
          )
        );
        processingMessageUpdated = true;
      }
    }

    if (!processingMessageUpdated) {
      setMessages((msgs) =>
        msgs.map((msg, i) =>
          i === msgs.length - 1
            ? {
                ...msg,
                content: `📄 Loaded "${documentName}" for analysis. What would you like to know about it?`,
              }
            : msg
        )
      );
    }
  }

  // Handle sending a message
  async function sendMessage(
    e?: React.FormEvent,
    presetMessage?: string,
    options?: SendMessageOptions
  ) {
    e?.preventDefault();

    const userMessage = (presetMessage ?? input).trim();

    if (!userMessage && !selectedDoc && !selectedFile) {
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
      setMessages((msgs) => [...msgs, newUserMessage]);
      
      // Update conversation title if this is the first user message
      if (currentConversationId && messages.filter(m => m.role === "user").length === 0) {
        const shortTitle = userMessage.length > 50 
          ? userMessage.substring(0, 47) + "..." 
          : userMessage;
        updateConversation.mutate({ 
          id: currentConversationId, 
          title: shortTitle 
        });
      }
      
      // Save user message to database
      if (currentConversationId) {
        saveMessage.mutate({
          conversationId: currentConversationId,
          role: "user",
          content: userMessage,
        });
      }
    }

    // Show typing indicator
    setMessages((msgs) => [
      ...msgs,
      { role: "assistant", content: "", isStreaming: true, timestamp: new Date() }
    ]);

    try {
      const overrideDocumentContent = options?.overrideDocumentContent;

      let content: string = "";
      let contextInfo: string = "";

      // Check if we have selected document or relevant documents from RAG/vector search
      if (
        selectedDoc ||
        selectedFile ||
        (ragResults && ragResults.length > 0) ||
        (relevantDocs &&
          (relevantDocs.documents.length > 0 ||
            relevantDocs.contracts.length > 0))
      ) {
        if (selectedDoc && (documentContent || overrideDocumentContent)) {
          const mergedDocumentContent = (documentContent ?? selectedDoc) as any;

          // Use the full content from the manually selected document or the override provided
          content =
            overrideDocumentContent ??
            documentContent?.fullContent ??
            (documentContent?.type === "contract"
              ? documentContent?.terms
              : documentContent?.content) ??
            "";

          // Add metadata for better context
          contextInfo = `Document: ${
            mergedDocumentContent.type === "contract"
              ? mergedDocumentContent.title ?? mergedDocumentContent.name
              : mergedDocumentContent.name ?? mergedDocumentContent.title ?? selectedDoc.name
          }
Type: ${mergedDocumentContent.type === "contract" ? "Contract" : "Document"}
${mergedDocumentContent.contract_type ? `Contract Type: ${mergedDocumentContent.contract_type}` : ""}
${mergedDocumentContent.type === "contract" && mergedDocumentContent.status ? `Status: ${mergedDocumentContent.status}` : ""}
${mergedDocumentContent.value ? `Value: ${mergedDocumentContent.currency || "USD"} ${mergedDocumentContent.value}` : ""}
${mergedDocumentContent.type === "contract" && mergedDocumentContent.start_date ? `Start Date: ${mergedDocumentContent.start_date}` : ""}
${mergedDocumentContent.type === "contract" && mergedDocumentContent.end_date ? `End Date: ${mergedDocumentContent.end_date}` : ""}
${mergedDocumentContent.type === "document" && mergedDocumentContent.effective_date ? `Effective Date: ${mergedDocumentContent.effective_date}` : ""}
${mergedDocumentContent.type === "document" && mergedDocumentContent.termination_date ? `Termination Date: ${mergedDocumentContent.termination_date}` : ""}
Created: ${
            mergedDocumentContent.created_at
              ? new Date(mergedDocumentContent.created_at).toLocaleDateString()
              : "Unknown"
          }

Question: ${userMessage}

Document Content:
${content}`;

          // If still no content, provide guidance
          if (!content.trim()) {
            const fallbackName =
              mergedDocumentContent.type === "contract"
                ? mergedDocumentContent.title ?? mergedDocumentContent.name ?? selectedDoc.name
                : mergedDocumentContent.name ?? mergedDocumentContent.title ?? selectedDoc.name;

            content = `Document "${fallbackName}" selected but no text content available. The document may be an uploaded file without extracted text content. You can still ask me questions about this document and I'll help based on the metadata available.`;
          }
        } else if (selectedFile && extractedContent) {
          // Use the extracted content
          content = extractedContent;
          contextInfo = `Document: ${selectedFile.name}
Type: ${selectedFile.type || "Unknown"}
Size: ${(selectedFile.size / 1024).toFixed(1)} KB

User Question: ${userMessage}

Document Content:
${extractedContent}`;
        } else if (selectedFile && !extractedContent) {
          // File selected but no content extracted yet
          toast({
            title: "Content not available",
            description: "Please wait for document extraction to complete, or select a different document.",
            variant: "default"
          });
          return;
        } else if (ragResults && ragResults.length > 0) {
          // Use RAG results for enhanced context
          const topResults = ragResults.slice(0, 5); // Use top 5 most relevant chunks

          let contextContent = `Found ${topResults.length} relevant document chunks from your knowledge base:\n\n`;

          topResults.forEach((result, i) => {
            contextContent += `${i + 1}. From "${result.documentName}" (${result.documentType}):\n`;
            contextContent += `   ${result.content.substring(0, 300)}${
              result.content.length > 300 ? "..." : ""
            }\n`;
            contextContent += `   Relevance: ${(result.similarity * 100).toFixed(
              1
            )}%\n\n`;
          });

          contextInfo = `Based on your question: "${userMessage}"

${contextContent}

Please provide a comprehensive answer based on the relevant document content above.`;

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
        setIsTyping(true);

        try {
          // Use the AI for general legal questions
          await streamAnalysis({
            content: `Legal Question: ${userMessage}

Please provide a helpful response to this legal question. If you need specific document context to provide a complete answer, let the user know they can upload or select a document for more detailed analysis.`,
            analysisType: "general",
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
        } catch (error) {
          console.error("Error with general query:", error);
          simulateTypingResponse(
            "I'm here to help with legal questions and document analysis. Please upload or select a document for detailed analysis, or ask me a general legal question.",
            50
          );
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

  // Simulate typing for demo purposes (would be replaced by actual streaming in production)
  function simulateTypingResponse(text: string, speed: number = 30) {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= text.length) {
        setMessages((msgs) =>
          msgs.map((msg, idx) =>
            idx === msgs.length - 1
              ? {
                  ...msg,
                  content: text.substring(0, i),
                  isStreaming: i < text.length
                }
              : msg
          )
        );
        i++;
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, speed);
  }

  // Function to handle adding an example prompt
  function useExamplePrompt(prompt: string) {
    setInput(prompt);
  }

  const handleQuickAction = async (action: QuickAction) => {
    if (isStreaming || isTyping || isExtracting) {
      toast({
        title: "Please wait",
        description:
          "Allow the current analysis to finish before starting a new one."
      });
      return;
    }

    if (action.requiresDocument && !selectedDoc && !selectedFile) {
      toast({
        title: "Select a document",
        description:
          "Choose or upload a document so Ream AI can ground its analysis."
      });
      return;
    }

    let overrideDocumentContent: string | undefined;

    if (
      action.requiresDocument &&
      selectedDoc &&
      documentContent &&
      !documentContent.fullContent
    ) {
      const isContract = selectedDoc.type === "contract";
      const looksLikePdf = Boolean(
        (selectedDoc.mime_type && selectedDoc.mime_type.toLowerCase().includes("pdf")) ||
          (selectedDoc.file_path && selectedDoc.file_path.toLowerCase().endsWith(".pdf"))
      );
      const documentFilePath =
        documentContent && typeof documentContent === "object" && "file_path" in documentContent
          ? (documentContent as { file_path?: string }).file_path
          : undefined;
      const filePath = selectedDoc.file_path || documentFilePath;

      if (looksLikePdf && filePath) {
        try {
          setIsExtracting(true);
          const extractedText = await runExtractionForDocument({
            doc: selectedDoc,
            isContract,
            filePath,
          });

          if (!extractedText) {
            toast({
              title: "Limited context",
              description:
                "We couldn't extract text from this PDF. Responses may be limited to metadata.",
            });
            return;
          }

          overrideDocumentContent = extractedText;

          setSelectedDoc((current: any) => {
            if (!current || current.id !== selectedDoc.id) {
              return current;
            }
            return isContract
              ? { ...current, terms: extractedText }
              : { ...current, content: extractedText };
          });
        } catch (error) {
          console.error("Quick action extraction failed:", error);
          toast({
            variant: "destructive",
            title: "Extraction failed",
            description:
              "We couldn't extract text from this document. Try a text-based version or upload a different file.",
          });
          return;
        } finally {
          setIsExtracting(false);
        }
      } else {
        toast({
          title: "Limited context",
          description:
            "This document doesn't include extracted text yet and cannot be processed automatically.",
        });
        return;
      }
    }

    void sendMessage(undefined, action.prompt, { overrideDocumentContent });
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

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col overflow-hidden lg:flex-row">
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
        <main className="flex h-full flex-1 flex-col overflow-hidden">
          <Card className="flex h-full w-full flex-1 flex-col rounded-none border-x-0 border-t-0">
            <CardHeader className="border-b px-4 py-3 sm:px-6">
              <ReamAIHeader
                activeDocumentLabel={activeDocumentLabel}
                hasDocumentContext={hasDocumentContext}
                documentContent={documentContent}
                isBusy={isStreaming || isTyping}
                onQuickAction={handleQuickAction}
              />
            </CardHeader>

                {/* Main chat/message area with its own scrolling */}
                <div className="flex min-h-0 flex-1 flex-col">
                  {ragResults && ragResults.length > 0 && (
                    <div className="border-b bg-muted/30 px-4 py-3 sm:px-6">
                      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> Context matches
                      </p>
                      <div className="mt-2 space-y-2">
                        {ragResults.slice(0, 3).map((result, index) => (
                          <div
                            key={`${result.chunkId}-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            <p className="font-medium text-foreground">
                              {result.documentName} ({result.documentType})
                            </p>
                            <p className="line-clamp-2">{result.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
                    <div className="flex flex-col gap-3 px-4 py-4 pb-24 sm:px-6">
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          } ${msg.role === "system" ? "justify-center" : ""}`}
                        >
                          {msg.role === "system" ? (
                            <Card className="w-full max-w-3xl bg-muted/40">
                              <CardContent className="px-4 py-3 text-sm">
                                <p className="text-sm">{msg.content}</p>
                              </CardContent>
                            </Card>
                          ) : (
                            <div
                              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                                msg.role === "user"
                                  ? "ml-auto bg-muted text-foreground"
                                  : "mr-auto border border-border/60 bg-background text-foreground"
                              }`}
                            >
                              {msg.content || (msg.isStreaming && <span className="animate-pulse">▋</span>)}
                              {msg.timestamp && (
                                <div
                                  className={cn(
                                    "mt-2 text-[10px] text-muted-foreground",
                                    msg.role === "user" ? "text-right" : "text-left"
                                  )}
                                >
                                  {msg.timestamp.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Example prompts */}
                  {messages.length <= 2 && (
                    <div className="border-t bg-background/95 px-4 py-3 sm:px-6">
                      <p className="mb-2 text-sm text-muted-foreground">Try asking:</p>
                      <div className="flex flex-wrap gap-2">
                        {EXAMPLE_PROMPTS.map((prompt, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => useExamplePrompt(prompt)}
                          >
                            {prompt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Input form */}
                  <form
                    className="sticky bottom-0 left-0 right-0 z-10 border-t bg-background"
                    onSubmit={(event) => sendMessage(event)}
                    style={{ boxShadow: "0 -2px 8px -4px rgba(0,0,0,0.04)" }}
                  >
                    {/* Document selector - compact button above input */}
                    <div className="border-b px-4 py-2">
                      <Popover open={isDocSelectorOpen} onOpenChange={setIsDocSelectorOpen}>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-xs"
                          >
                            <FileText className="mr-2 h-3.5 w-3.5" />
                            {selectedDoc || selectedFile 
                              ? "Change Document" 
                              : "Select Document"}
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
                    </div>

                    <div className="flex gap-2 px-4 py-3 sm:px-6">
                      <Input
                        className="flex-1"
                        placeholder={
                          selectedDoc || selectedFile
                            ? "Ask about this document or request analysis..."
                            : "Select a document first or ask a general legal question..."
                        }
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isStreaming || isTyping}
                      />
                      {isStreaming ? (
                        <Button type="button" variant="destructive" onClick={cancelStreaming}>
                          <StopCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button type="submit" disabled={isTyping}>
                          {isTyping ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </Card>
            </main>
          </ModuleErrorBoundary>
        </div>
  );
}
