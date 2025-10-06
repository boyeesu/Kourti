import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import { formatDate } from "@/lib/utils";
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
  ListChecks
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
    <div className="flex h-[calc(100vh-100px)] overflow-hidden">
      {/* Left: doc/contract & upload */}
      <ModuleErrorBoundary name="Document Selector">
        <aside className="w-72 min-w-[18rem] border-r bg-accent/40 p-4 flex flex-col h-full">
          <h2 className="font-semibold mb-2">Knowledge Base</h2>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents/contracts…"
              className="pl-10"
            />
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 mb-2">
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
              <ScrollArea className="h-[calc(100vh-260px)]">
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
              <ScrollArea className="h-[calc(100vh-260px)]">
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
          
          <div {...getRootProps()} className={`mt-2 p-3 border-2 border-dashed rounded-md cursor-pointer text-center transition-colors ${
            isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:bg-accent"
          }`}>
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
            <Card className="mt-4 bg-accent">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  {selectedDoc ? (
                    <>
                      {selectedDoc.type === "contract" ? (
                        <FileCheck className="h-4 w-4 mr-2" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      <span className="truncate">{selectedDoc.title || selectedDoc.name}</span>
                    </>
                  ) : selectedFile ? (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      <span className="truncate">{selectedFile.name}</span>
                    </>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-3 pb-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  {selectedDoc && (
                    <>
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {selectedDoc.type === "contract" ? "Contract" : "Document"}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Created:</span>
                        <span>{formatDate(selectedDoc.created_at)}</span>
                      </div>
                    </>
                  )}
                  {selectedFile && (
                    <>
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {selectedFile.type.split('/')[1].toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Size:</span>
                        <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </ModuleErrorBoundary>

      {/* Right: Chat UI */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <ModuleErrorBoundary name="Ream AI Chat">
          <Card className="flex-1 flex flex-col w-full h-full rounded-none border-0 border-l-0 border-r-0 border-t-0">
            <CardHeader className="border-b py-3 space-y-3">
              <CardTitle className="flex items-center">
                <span className="bg-gradient-to-r from-primary to-blue-500 text-transparent bg-clip-text font-bold mr-2">
                  Ream AI
                </span>
                <Badge variant="outline" className="ml-2 font-normal">
                  Beta
                </Badge>
              </CardTitle>
              {activeDocumentLabel && (
                <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                  <span className="font-medium text-foreground/80">{activeDocumentLabel}</span>
                  {documentContent?.contract_type && (
                    <Badge variant="secondary" className="text-[10px]">{documentContent.contract_type}</Badge>
                  )}
                  {documentContent?.type === 'contract' && documentContent.status && (
                    <Badge variant="secondary" className="text-[10px]">Status: {documentContent.status}</Badge>
                  )}
                  {documentContent?.value && (
                    <span>Value: {documentContent.currency || 'USD'} {documentContent.value}</span>
                  )}
                  {documentContent?.type === 'document' && documentContent.effective_date && (
                    <span>Effective: {formatDate(documentContent.effective_date)}</span>
                  )}
                  {documentContent?.type === 'document' && documentContent.termination_date && (
                    <span>Termination: {formatDate(documentContent.termination_date)}</span>
                  )}
                  {documentContent?.type === 'contract' && documentContent.start_date && (
                    <span>Start: {formatDate(documentContent.start_date)}</span>
                  )}
                  {documentContent?.type === 'contract' && documentContent.end_date && (
                    <span>Ends: {formatDate(documentContent.end_date)}</span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  const disabled = action.requiresDocument && !hasDocumentContext;
                  return (
                    <Button
                      key={action.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => handleQuickAction(action)}
                      className="text-xs"
                      title={disabled ? "Select a document to enable" : undefined}
                    >
                      <Icon className="h-3.5 w-3.5 mr-1" />
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>

            {/* Main chat/message area with its own scrolling */}
            <div className="flex-1 flex flex-col min-h-0">
              {(ragResults && ragResults.length > 0) && (
                <div className="px-4 py-3 border-b bg-muted/40">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
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
                <div className="flex flex-col p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
                        msg.role === "system" ? "justify-center" : ""
                      }`}
                    >
                      {msg.role === "system" ? (
                        <Card className="max-w-3xl w-full bg-accent/50">
                          <CardContent className="p-4">
                            <p className="text-sm">{msg.content}</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <div
                          className={`max-w-[80%] px-4 py-3 rounded-xl ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground ml-auto"
                              : "bg-muted mr-auto"
                          }`}
                        >
                          {msg.content || (msg.isStreaming && <span className="animate-pulse">▋</span>)}
                          {/* Add timestamp if available */}
                          {msg.timestamp && (
                            <div className="text-[10px] opacity-70 mt-1 text-right">
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
                <div className="px-4 py-2 border-t bg-background/95">
                  <p className="text-sm text-muted-foreground mb-2">Try asking:</p>
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
                className="flex gap-2 p-4 border-t bg-background sticky bottom-0 left-0 right-0 z-10"
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