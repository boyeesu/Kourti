import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDropzone } from "react-dropzone";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVectorSearch } from "@/hooks/useVectorSearch";
import { useRAGSearch, useProcessDocument } from "@/hooks/useRAGSearch";
import { useDocuments } from "@/hooks/useDocuments";
import { useContracts } from "@/hooks/useContracts";
import { useEnhancedDocumentAnalysis } from "@/hooks/useEnhancedDocumentAnalysis";
import { useDocumentContent } from "@/hooks/useDocumentContext";
import { useOrganization } from "@/hooks/useOrganization";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDate } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Send,
  FileText,
  FileCheck,
  Search,
  Loader2,
  StopCircle,
  Sparkles,
  ShieldAlert,
  ListChecks,
  ChevronRight
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Summarize",
    prompt: "Provide an executive summary that highlights the purpose, parties, and the three most important obligations in this document.",
    requiresDocument: true,
    icon: Sparkles
  },
  {
    label: "Risk Review",
    prompt: "Identify the top risks, liabilities, or unusual clauses in this document. Explain why they matter and recommend follow-up actions.",
    requiresDocument: true,
    icon: ShieldAlert
  },
  {
    label: "Key Obligations",
    prompt: "List all material obligations, deadlines, and compliance requirements in this document with clear bullet points.",
    requiresDocument: true,
    icon: ListChecks
  },
  {
    label: "Draft Follow-up Email",
    prompt: "Draft a professional follow-up email summarizing the current findings and next steps for the client.",
    requiresDocument: false,
    icon: Send
  }
];

interface ReamAIHeaderProps {
  activeDocumentLabel: string | null;
  hasDocumentContext: boolean;
  documentContent: any;
  isBusy: boolean;
  onQuickAction: (action: QuickAction) => void;
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
    onQuickAction(action);
    setTimeout(() => setSelectedAction(null), 250);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb}-${index}`}>
              {index > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              <span className={cn("truncate", index === breadcrumbs.length - 1 ? "text-foreground font-medium" : "")}>{crumb}</span>
            </React.Fragment>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Ream AI</h1>
          <Badge variant="outline" className="text-[11px] font-normal uppercase tracking-wide">
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
            const disabled = isBusy || (action.requiresDocument && !hasDocumentContext);
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
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70"
                )}
                title={disabled && action.requiresDocument ? "Select a document to enable" : undefined}
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

  // State for chat and document selection
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "system", 
      content: "Welcome to Ream AI with RAG! Select or upload a document/contract, and I'll process it for intelligent retrieval. Your documents will be chunked and embedded for better context-aware responses.",
      timestamp: new Date()
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [search, setSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("documents");
  const [isTyping, setIsTyping] = useState(false);
  const [enableVectorSearch] = useState(true);
  const [activeQuery, setActiveQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Get current organization for document processing
  const { data: organization } = useOrganization();
  
  // Fetch documents and contracts
  const { data: documents = [], isLoading: docsLoading } = useDocuments();
  const { data: contractsData, isLoading: contractsLoading } = useContracts();
  const contracts = contractsData?.contracts || [];
  
  // Get document analysis functionality
  const { 
    streamAnalysis, 
    cancelStreaming, 
    isStreaming,
  } = useEnhancedDocumentAnalysis();

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
  const { data: relevantDocs } = useVectorSearch(activeQuery, enableVectorSearch && activeQuery.length > 10);

  // Auto-select contract from URL params
  useEffect(() => {
    const contractId = searchParams.get('contract');
    if (contractId && contracts.length > 0) {
      const contract = contracts.find(c => c.id === contractId);
      if (contract) {
        handleSelectDoc(contract, true);
        setActiveTab('contracts');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, contracts]);

  // Scroll to bottom of messages when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle file uploads
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      setSelectedDoc(null); // Clear any selected document

      // Add message about the upload
      setMessages((msgs) => [
        ...msgs,
        { 
          role: "user", 
          content: `I've uploaded "${file.name}" for analysis.`, 
          timestamp: new Date() 
        }
      ]);
      
      // Add assistant response
      setMessages((msgs) => [
        ...msgs,
        { 
          role: "assistant", 
          content: `I've received your file "${file.name}". You can now ask me to analyze it or ask specific questions about its content.`, 
          timestamp: new Date() 
        }
      ]);
    }
  };
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    }
  });

  // Handle document/contract selection
  async function handleSelectDoc(doc: any, isContract: boolean) {
    setSelectedDoc({ ...doc, type: isContract ? "contract" : "document" });
    setSelectedFile(null); // Clear any uploaded file
    
    // Add messages about the selection
    setMessages((msgs) => [
      ...msgs,
      { 
        role: "user", 
        content: `I'd like to analyze this ${isContract ? "contract" : "document"}: ${doc.title || doc.name}`, 
        timestamp: new Date() 
      }
    ]);
    
    setMessages((msgs) => [
      ...msgs,
      { 
        role: "assistant", 
        content: `I'm processing "${doc.title || doc.name}" for RAG analysis. This may take a moment as I chunk and embed the content for better retrieval...`, 
        timestamp: new Date() 
      }
    ]);

    // Process document for RAG if we have organization context
    if (organization?.id && doc.content) {
      try {
        await processDocument.mutateAsync({
          documentId: !isContract ? doc.id : undefined,
          contractId: isContract ? doc.id : undefined,
          content: isContract ? (doc.terms || doc.description || '') : (doc.content || ''),
          organizationId: organization.id,
          documentType: isContract ? 'contract' : 'document'
        });
        
        // Update the message to show processing is complete
        setMessages((msgs) => 
          msgs.map((msg, i) => 
            i === msgs.length - 1 ? 
              { 
                ...msg, 
                content: `✅ Successfully processed "${doc.title || doc.name}" for RAG analysis! The document has been chunked and embedded. You can now ask detailed questions about its content.`
              } : 
              msg
          )
        );
      } catch (error) {
        console.error('Error processing document:', error);
        setMessages((msgs) => 
          msgs.map((msg, i) => 
            i === msgs.length - 1 ? 
              { 
                ...msg, 
                content: `⚠️ Loaded "${doc.title || doc.name}" but RAG processing failed. I can still analyze the document, but responses may be less contextual.`
              } : 
              msg
          )
        );
      }
    } else {
      setMessages((msgs) => 
        msgs.map((msg, i) => 
          i === msgs.length - 1 ? 
            { 
              ...msg, 
              content: `📄 Loaded "${doc.title || doc.name}" for analysis. What would you like to know about it?`
            } : 
            msg
        )
      );
    }
  }

  // Handle sending a message
  async function sendMessage(e?: React.FormEvent, presetMessage?: string) {
    e?.preventDefault();

    const userMessage = (presetMessage ?? input).trim();

    if (!userMessage && !selectedDoc && !selectedFile) {
      return;
    }

    setInput("");

    if (userMessage) {
      setActiveQuery(userMessage);
    }

    // Add user message to chat
    if (userMessage) {
      setMessages((msgs) => [
        ...msgs,
        { role: "user", content: userMessage, timestamp: new Date() }
      ]);
    }
    
    // Show typing indicator
    setMessages((msgs) => [
      ...msgs,
      { role: "assistant", content: "", isStreaming: true, timestamp: new Date() }
    ]);
    
    try {
      let content: string = "";
      let contextInfo: string = "";
      
      // Check if we have selected document or relevant documents from RAG/vector search
      if (selectedDoc || selectedFile || (ragResults && ragResults.length > 0) || (relevantDocs && (relevantDocs.documents.length > 0 || relevantDocs.contracts.length > 0))) {
        
        if (selectedDoc && documentContent) {
          // Use the full content from the manually selected document
          content = documentContent.fullContent || "";
          
          // Add metadata for better context
          contextInfo = `Document: ${
            documentContent.type === 'contract' 
              ? documentContent.title 
              : documentContent.name
          }
Type: ${documentContent.type === 'contract' ? 'Contract' : 'Document'}
${documentContent.contract_type ? `Contract Type: ${documentContent.contract_type}` : ''}
${documentContent.type === 'contract' && documentContent.status ? `Status: ${documentContent.status}` : ''}
${documentContent.value ? `Value: ${documentContent.currency || 'USD'} ${documentContent.value}` : ''}
${documentContent.type === 'contract' && documentContent.start_date ? `Start Date: ${documentContent.start_date}` : ''}
${documentContent.type === 'contract' && documentContent.end_date ? `End Date: ${documentContent.end_date}` : ''}
${documentContent.type === 'document' && documentContent.effective_date ? `Effective Date: ${documentContent.effective_date}` : ''}
${documentContent.type === 'document' && documentContent.termination_date ? `Termination Date: ${documentContent.termination_date}` : ''}
Created: ${documentContent.created_at ? new Date(documentContent.created_at).toLocaleDateString() : 'Unknown'}

Question: ${userMessage}

Document Content:
${content}`;
          
          // If still no content, provide guidance
          if (!content.trim()) {
            content = `Document "${
              documentContent.type === 'contract' 
                ? documentContent.title 
                : documentContent.name
            }" selected but no text content available. The document may be an uploaded file without extracted text content. You can still ask me questions about this document and I'll help based on the metadata available.`;
          }
        } else if (selectedFile) {
          // Handle uploaded files
          if (selectedFile.type === 'application/pdf') {
            content = `PDF file "${selectedFile.name}" uploaded. PDF text extraction is currently being processed. Please ask specific questions about this document, or upload a text-based document (.txt, .docx) for direct analysis.

User Question: ${userMessage}`;
          } else if (selectedFile.type.startsWith('text/') || selectedFile.name.endsWith('.txt')) {
            // For text files, we can read the content
            const fileContent = await selectedFile.text();
            content = `Document: ${selectedFile.name}
Type: Uploaded Text File
Size: ${(selectedFile.size / 1024).toFixed(1)} KB

Question: ${userMessage}

Document Content:
${fileContent}`;
          } else {
            content = `Document "${selectedFile.name}" uploaded. Please provide specific questions about this document for analysis.

User Question: ${userMessage}`;
          }
        } else if (ragResults && ragResults.length > 0) {
          // Use RAG results for enhanced context
          const topResults = ragResults.slice(0, 5); // Use top 5 most relevant chunks
          
          let contextContent = `Found ${topResults.length} relevant document chunks from your knowledge base:\n\n`;
          
          topResults.forEach((result, i) => {
            contextContent += `${i + 1}. From "${result.documentName}" (${result.documentType}):\n`;
            contextContent += `   ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}\n`;
            contextContent += `   Relevance: ${(result.similarity * 100).toFixed(1)}%\n\n`;
          });
          
          contextInfo = `Based on your question: "${userMessage}"

${contextContent}

Please provide a comprehensive answer based on the relevant document content above.`;
          
          content = contextInfo;
        } else if (relevantDocs && (relevantDocs.documents.length > 0 || relevantDocs.contracts.length > 0)) {
          // Use relevant documents found through vector search
          const relevantDocuments = relevantDocs.documents.slice(0, 3);
          const relevantContracts = relevantDocs.contracts.slice(0, 3);
          
          let contextContent = '';
          
          if (relevantDocuments.length > 0) {
            contextContent += '\\n\\nRELEVANT DOCUMENTS:\\n';
            relevantDocuments.forEach((doc, i) => {
              contextContent += `\\n${i + 1}. ${doc.name}`;
              if (doc.summary) contextContent += `\\n   Summary: ${doc.summary}`;
              if (doc.content) contextContent += `\\n   Content: ${doc.content.substring(0, 500)}${doc.content.length > 500 ? '...' : ''}`;
              contextContent += `\\n   Similarity: ${(doc.similarity * 100).toFixed(1)}%\\n`;
            });
          }
          
          if (relevantContracts.length > 0) {
            contextContent += '\\n\\nRELEVANT CONTRACTS:\\n';
            relevantContracts.forEach((contract, i) => {
              contextContent += `\\n${i + 1}. ${contract.title}`;
              if (contract.description) contextContent += `\\n   Description: ${contract.description}`;
              if (contract.terms) contextContent += `\\n   Terms: ${contract.terms.substring(0, 500)}${contract.terms.length > 500 ? '...' : ''}`;
              contextContent += `\\n   Similarity: ${(contract.similarity * 100).toFixed(1)}%\\n`;
            });
          }
          
          contextInfo = `Based on your question, I found ${relevantDocuments.length + relevantContracts.length} relevant documents in your knowledge base:

${contextContent}

Your Question: ${userMessage}

I'll answer based on the relevant information found above.`;
          
          content = contextInfo;
        }
        
        // Stream the AI analysis with enhanced context
        await streamAnalysis({
          content: contextInfo || content,
          analysisType: userMessage.toLowerCase().includes('risk') ? 'risk' : 
                      userMessage.toLowerCase().includes('extract') || userMessage.toLowerCase().includes('key') ? 'extract' :
                      userMessage.toLowerCase().includes('compare') ? 'compare' :
                      userMessage.toLowerCase().includes('summary') || userMessage.toLowerCase().includes('summarize') ? 'summary' :
                      'general',
          onProgress: (aiContent, done) => {
            setMessages((msgs) => 
              msgs.map((msg, i) => 
                i === msgs.length - 1 ? 
                  { ...msg, content: aiContent, isStreaming: !done } : 
                  msg
              )
            );
            
            if (done) {
              setIsTyping(false);
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
                  i === msgs.length - 1 ? 
                    { ...msg, content: aiContent, isStreaming: !done } : 
                    msg
                )
              );
              
              if (done) {
                setIsTyping(false);
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
          i === msgs.length - 1 ? 
            { 
              ...msg, 
              content: "Sorry, I encountered an error processing your request. Please try again.", 
              isStreaming: false 
            } : 
            msg
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
            idx === msgs.length - 1 ? 
              { ...msg, content: text.substring(0, i), isStreaming: i < text.length } : 
              msg
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

  const handleQuickAction = (action: QuickAction) => {
    if (isStreaming || isTyping) {
      toast({
        title: "Please wait",
        description: "Allow the current analysis to finish before starting a new one.",
      });
      return;
    }

    if (action.requiresDocument && !selectedDoc && !selectedFile) {
      toast({
        title: "Select a document",
        description: "Choose or upload a document so Ream AI can ground its analysis.",
      });
      return;
    }

    if (action.requiresDocument && documentContent && !documentContent.fullContent) {
      toast({
        title: "No extracted text",
        description: "This file doesn't have extracted text yet. Ask a general question or upload a text-based document.",
      });
    }

    void sendMessage(undefined, action.prompt);
  };

  const activeDocumentLabel = selectedDoc
    ? `${selectedDoc.type === 'contract' ? 'Contract' : 'Document'}: ${selectedDoc.title || selectedDoc.name}`
    : selectedFile
      ? `Uploaded file: ${selectedFile.name}`
      : null;
  const hasDocumentContext = Boolean(selectedDoc || selectedFile);

  // Filter documents based on search term
  const filteredDocuments = documents.filter(doc => 
    (doc.title || doc.name || '').toLowerCase().includes(search.toLowerCase())
  );
  
  const filteredContracts = contracts.filter(contract => 
    (contract.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col overflow-hidden lg:flex-row">
      {/* Left: doc/contract & upload */}
      <ModuleErrorBoundary name="Document Selector">
        <aside className="flex h-full w-full flex-shrink-0 flex-col border-b border-r border-border bg-muted/20 p-4 lg:w-72 lg:min-w-[18rem] lg:border-b-0">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Knowledge Base</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents/contracts…"
              className="h-9 pl-10"
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-2 grid grid-cols-2">
              <TabsTrigger value="documents" className="text-xs">
                <FileText className="h-3.5 w-3.5 mr-1" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="contracts" className="text-xs">
                <FileCheck className="h-3.5 w-3.5 mr-1" />
                Contracts
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="documents" className="mt-0">
              <ScrollArea className="h-64 lg:h-[calc(100vh-260px)]">
                {docsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {search ? "No matching documents" : "No documents found"}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredDocuments.map((doc) => (
                      <li key={doc.id}>
                        <button
                          className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center hover:bg-accent transition-colors ${
                            selectedDoc?.id === doc.id ? "bg-accent" : ""
                          }`}
                          onClick={() => handleSelectDoc(doc, false)}
                        >
                          <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{doc.title || doc.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="contracts" className="mt-0">
              <ScrollArea className="h-64 lg:h-[calc(100vh-260px)]">
                {contractsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : filteredContracts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {search ? "No matching contracts" : "No contracts found"}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredContracts.map((contract) => (
                      <li key={contract.id}>
                        <button
                          className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center hover:bg-accent transition-colors ${
                            selectedDoc?.id === contract.id ? "bg-accent" : ""
                          }`}
                          onClick={() => handleSelectDoc(contract, true)}
                        >
                          <FileCheck className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{contract.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
          
          <div
            {...getRootProps()}
            className={cn(
              "mt-3 cursor-pointer rounded-lg border border-dashed border-muted-foreground/50 bg-background/60 p-3 text-center text-sm transition-colors",
              isDragActive ? "border-primary bg-primary/10" : "hover:bg-muted"
            )}
          >
            <input {...getInputProps()} />
            <Plus className="inline-block mr-2 h-4 w-4 text-muted-foreground" />
            {isDragActive ? (
              <span className="text-sm">Drop file here...</span>
            ) : (
              <span className="text-sm">Upload Document</span>
            )}
            {selectedFile && (
              <div className="mt-1 text-xs text-muted-foreground truncate">
                Selected: {selectedFile.name}
              </div>
            )}
          </div>
          
          {(selectedDoc || selectedFile) && (
            <div className="mt-4 rounded-lg border border-border bg-background/70">
              <div className="flex items-center gap-2 border-b border-border/80 px-3 py-2 text-sm font-medium text-foreground">
                {selectedDoc ? (
                  <>
                    {selectedDoc.type === "contract" ? (
                      <FileCheck className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span className="truncate">{selectedDoc.title || selectedDoc.name}</span>
                  </>
                ) : selectedFile ? (
                  <>
                    <FileText className="h-4 w-4" />
                    <span className="truncate">{selectedFile.name}</span>
                  </>
                ) : null}
              </div>
              <div className="px-3 py-2 text-xs">
                <dl className="divide-y divide-border/60">
                  {selectedDoc && (
                    <>
                      <div className="flex items-center justify-between py-2">
                        <dt className="text-muted-foreground">Type</dt>
                        <dd>
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {selectedDoc.type === "contract" ? "Contract" : "Document"}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{formatDate(selectedDoc.created_at)}</dd>
                      </div>
                    </>
                  )}
                  {selectedFile && (
                    <>
                      <div className="flex items-center justify-between py-2">
                        <dt className="text-muted-foreground">Type</dt>
                        <dd>
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {selectedFile.type.split("/")[1].toUpperCase()}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <dt className="text-muted-foreground">Size</dt>
                        <dd>{(selectedFile.size / 1024).toFixed(1)} KB</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            </div>
          )}
        </aside>
      </ModuleErrorBoundary>

      {/* Right: Chat UI */}
      <main className="flex h-full flex-1 flex-col overflow-hidden">
        <ModuleErrorBoundary name="Ream AI Chat">
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
              {(ragResults && ragResults.length > 0) && (
                <div className="border-b bg-muted/30 px-4 py-3 sm:px-6">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> Context matches
                  </p>
                  <div className="mt-2 space-y-2">
                    {ragResults.slice(0, 3).map((result, index) => (
                      <div key={`${result.chunkId}-${index}`} className="text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{result.documentName} ({result.documentType})</p>
                        <p className="line-clamp-2">{result.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-3 px-4 py-4 pb-24 sm:px-6">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
                        msg.role === "system" ? "justify-center" : ""
                      }`}
                    >
                      {msg.role === "system" ? (
                        <Card className="w-full max-w-3xl bg-muted/40">
                          <CardContent className="px-4 py-3 text-sm">
                            <p className="text-sm">{msg.content}</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-3 text-sm shadow-sm ${
                            msg.role === "user"
                              ? "ml-auto bg-muted text-foreground"
                              : "mr-auto border border-border/60 bg-background text-foreground"
                          }`}
                        >
                          {msg.content || (msg.isStreaming && <span className="animate-pulse">▋</span>)}
                          {/* Add timestamp if available */}
                          {msg.timestamp && (
                            <div className={cn(
                              "mt-2 text-[10px] text-muted-foreground",
                              msg.role === "user" ? "text-right" : "text-left"
                            )}>
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* For auto-scrolling */}
                  <div ref={messagesEndRef} />
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

              {/* Input form always at the very bottom, never scrolled */}
              <form
                className="sticky bottom-0 left-0 right-0 z-10 flex gap-2 border-t bg-background px-4 py-3 sm:px-6"
                onSubmit={(event) => sendMessage(event)}
                style={{ boxShadow: '0 -2px 8px -4px rgba(0,0,0,0.04)' }}
              >
                <Input
                  className="flex-1"
                  placeholder={
                    selectedDoc || selectedFile
                      ? "Ask about this document or request analysis..."
                      : "Select a document first or ask a general legal question..."
                  }
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={isStreaming || isTyping}
                />
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={cancelStreaming}
                  >
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
              </form>
            </div>
          </Card>
        </ModuleErrorBoundary>
      </main>
    </div>
  );
}