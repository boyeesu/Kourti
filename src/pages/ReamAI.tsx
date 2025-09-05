import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDropzone } from "react-dropzone";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDocuments } from "@/hooks/useDocuments";
import { useContracts } from "@/hooks/useContracts";
import { useEnhancedDocumentAnalysis } from "@/hooks/useEnhancedDocumentAnalysis";
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
  StopCircle
} from "lucide-react";

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

export default function ReamAI() {
  const [searchParams] = useSearchParams();
  
  // State for chat and document selection
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "system", 
      content: "Welcome to Ream AI! Select or upload a document/contract, or ask me anything legal. I'm here to help analyze your documents and answer legal questions.",
      timestamp: new Date()
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [search, setSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("documents");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  function handleSelectDoc(doc: any, isContract: boolean) {
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
        content: `I've loaded "${doc.title || doc.name}" for analysis. What would you like to know about it?`, 
        timestamp: new Date() 
      }
    ]);
  }

  // Handle sending a message
  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    
    if (!input.trim() && !selectedDoc && !selectedFile) {
      return;
    }
    
    const userMessage = input.trim();
    setInput("");
    
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
        // Handle document analysis if a document is selected or uploaded
        if (selectedDoc || selectedFile) {
          let content: string;
          
          if (selectedDoc) {
            // For selected documents, get content from various fields
            content = selectedDoc.content || selectedDoc.terms || selectedDoc.description || selectedDoc.title || "";
            
            // If still no content, inform user to upload a document with text content
            if (!content.trim()) {
              content = `Document "${selectedDoc.title || selectedDoc.name}" selected but no text content available. Please upload a document with text content or provide specific questions about this document.`;
            }
          } else if (selectedFile) {
            // For uploaded files, handle different file types
            if (selectedFile.type === 'application/pdf') {
              // For PDFs, we need to inform the user that PDF text extraction is not yet supported
              content = `PDF file "${selectedFile.name}" uploaded. PDF text extraction is currently being processed. Please try asking specific questions about this document, or upload a text-based document (.txt, .docx) for direct analysis.`;
            } else if (selectedFile.type.startsWith('text/') || selectedFile.name.endsWith('.txt')) {
              // For text files, we can read the content
              content = await selectedFile.text();
            } else {
              // For other document types, provide a helpful message
              content = `Document "${selectedFile.name}" uploaded. Please provide specific questions about this document for analysis.`;
            }
          } else {
            throw new Error("No document selected");
          }
        
        // Stream the AI analysis
        await streamAnalysis({
          content,
          analysisType: "general",
          onProgress: (content, done) => {
            setMessages((msgs) => 
              msgs.map((msg, i) => 
                i === msgs.length - 1 ? 
                  { ...msg, content, isStreaming: !done } : 
                  msg
              )
            );
            
            if (done) {
              setIsTyping(false);
            }
          }
        });
      } else {
        // Simulate an AI response (for general queries without document context)
        setIsTyping(true);
        
        // In a real app, this would call an API endpoint for general legal queries
        simulateTypingResponse(
          "I don't have a document to analyze. Please upload or select a document first, or ask me a general legal question.",
          50
        );
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
            <CardHeader className="border-b py-3">
              <CardTitle className="flex items-center">
                <span className="bg-gradient-to-r from-primary to-blue-500 text-transparent bg-clip-text font-bold mr-2">
                  Ream AI
                </span>
                <Badge variant="outline" className="ml-2 font-normal">
                  Beta
                </Badge>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 p-0 overflow-y-auto">
              <ScrollArea className="h-full">
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
              </ScrollArea>
            </CardContent>
            
            {/* Example prompts */}
            {messages.length <= 2 && (
              <div className="px-4 py-2 border-t">
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
            
            {/* Input form */}
            <form 
              className="flex gap-2 p-4 border-t"
              onSubmit={sendMessage}
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
          </Card>
        </ModuleErrorBoundary>
      </main>
    </div>
  );
}