import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDropzone } from "react-dropzone";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Send, FileText, FileCheck } from "lucide-react";
import { useDocuments } from "@/hooks/useDocuments";
import { useContracts } from "@/hooks/useContracts";
import { useAnalyzeDocument } from "@/hooks/useAnalyzeDocument";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ReamAI() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Welcome to Ream AI! Select or upload a document/contract, or ask me anything legal." },
  ]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [search, setSearch] = useState<string>("");
  const { data: documents = [], isLoading: docsLoading } = useDocuments();
  const { data: contracts = [], isLoading: contractsLoading } = useContracts();
  const analyzeDocument = useAnalyzeDocument();

  // Upload logic
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      setSelectedFile(acceptedFiles[0]);
      setMessages((msgs) => [
        ...msgs,
        { role: "user", content: `Uploaded file: ${acceptedFiles[0].name}` },
        { role: "assistant", content: `Got it! Would you like me to analyze \"${acceptedFiles[0].name}\"?` },
      ]);
      // NOTE: You can use a separate upload mutation here if you want full support
      // For now, we just simulate review, as in the mock sample
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim()) return;
    setMessages((msgs) => [
      ...msgs,
      { role: "user", content: input },
    ]);
    // If a document or contract is selected, analyze it
    if (selectedDoc?.id && selectedDoc?.type) {
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", content: "Analyzing..." },
      ]);
      analyzeDocument.mutate(
        {
          docId: selectedDoc.id,
          content: selectedDoc.content || selectedDoc.terms || selectedDoc.title || selectedDoc.name || "",
        }, {
          onSuccess: ({ analysis }) => {
            setMessages((msgs) => [
              ...msgs,
              { role: "assistant", content: analysis || "No analysis returned." },
            ]);
          },
          onError: (error: any) => {
            setMessages((msgs) => [
              ...msgs,
              { role: "assistant", content: `Error: ${error.message || 'Could not process analysis.'}` },
            ]);
          }
        });
    } else {
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", content: '[Ream AI simulation] For a real legal review, select a document or contract to analyze!' },
      ]);
    }
    setInput("");
  }

  function handleSelectDoc(doc: any, isContract: boolean) {
    setSelectedDoc({ ...doc, type: isContract ? "contract" : "document" });
    setMessages((msgs) => [
      ...msgs,
      { role: "user", content: `Review this ${isContract ? "contract" : "document"}: ${doc.title || doc.name || doc.id}` },
      { role: "assistant", content: `Loaded \"${doc.title || doc.name}\" into context. You can now ask questions or request analysis.` },
    ]);
  }

  return (
    <div className="flex h-full">
      {/* Left: doc/contract & upload */}
      <aside className="w-72 min-w-[15rem] border-r bg-accent/40 p-4 flex flex-col">
        <h2 className="font-semibold mb-2">Your Documents</h2>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents/contracts…"
          className="mb-2"
        />
        <ScrollArea className="flex-1">
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1">Documents</div>
            {docsLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ul className="space-y-2">
                {documents
                  .filter(doc => `${doc.title ?? doc.name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
                  .map((doc) => (
                    <li key={doc.id}>
                      <Button variant={selectedDoc?.id === doc.id ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleSelectDoc(doc, false)}>
                        <FileText className="mr-2 h-4 w-4 inline" />
                        {doc.title || doc.name}
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
            <div className="text-xs text-muted-foreground mt-4 mb-1">Contracts</div>
            {contractsLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ul className="space-y-2">
                {contracts
                  .filter(contract => `${contract.title ?? ''}`.toLowerCase().includes(search.toLowerCase()))
                  .map((contract) => (
                    <li key={contract.id}>
                      <Button variant={selectedDoc?.id === contract.id ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleSelectDoc(contract, true)}>
                        <FileCheck className="mr-2 h-4 w-4 inline" />
                        {contract.title}
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </ScrollArea>
        <div {...getRootProps()} className={`mt-1 p-3 border-2 border-dashed rounded cursor-pointer text-center bg-background/80 ${isDragActive ? "border-primary ring-2 ring-primary" : "border-muted-foreground/30"}`}>
          <input {...getInputProps()} />
          <Plus className="inline mr-2 text-muted-foreground" />
          {isDragActive ? "Drop file here…" : "Upload Document or Contract"}
          {selectedFile && (
            <div className="mt-1 text-xs text-muted-foreground">Selected: {selectedFile.name}</div>
          )}
        </div>
      </aside>

      {/* Right: Chat UI */}
      <main className="flex-1 flex flex-col h-full">
        <Card className="flex-1 flex flex-col w-full h-full rounded-none">
          <CardHeader className="border-b">
            <CardTitle>Ream AI</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 p-4 space-y-2 overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`max-w-2xl px-4 py-2 rounded-lg my-1 ${msg.role === "user" ? "bg-primary text-primary-foreground ml-auto" : "bg-muted text-foreground mr-auto"}`}>
                {msg.content}
              </div>
            ))}
          </CardContent>
          <form className="flex gap-2 p-4 border-t" onSubmit={sendMessage}>
            <Input
              className="flex-1"
              placeholder="Ask a legal question, or direct Ream AI to analyze…"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
            />
            <Button type="submit" variant="default" disabled={analyzeDocument.isPending}>
              {analyzeDocument.isPending ? <span className="animate-spin">⌛</span> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
