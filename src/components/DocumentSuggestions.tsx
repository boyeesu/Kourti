import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, FileCheck, Search, Loader2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface Document {
  id: string;
  name?: string;
  title?: string;
  created_at: string;
  contract_type?: string;
  status?: string;
}

interface DocumentSuggestionsProps {
  documents: Document[];
  contracts: Document[];
  onSelectDocument: (doc: Document, isContract: boolean) => void;
  isLoading?: boolean;
}

export function DocumentSuggestions({
  documents,
  contracts,
  onSelectDocument,
  isLoading,
}: DocumentSuggestionsProps) {
  const [search, setSearch] = useState("");

  const filteredDocuments = documents.filter((doc) =>
    (doc.title || doc.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredContracts = contracts.filter((contract) =>
    (contract.title || "").toLowerCase().includes(search.toLowerCase())
  );

  const allItems = [
    ...filteredDocuments.slice(0, 3).map((doc) => ({ ...doc, type: "document" as const })),
    ...filteredContracts.slice(0, 3).map((contract) => ({ ...contract, type: "contract" as const })),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading knowledge base...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">
          Select a document or contract to analyze
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose from your knowledge base to get started with AI-powered analysis
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents and contracts..."
          className="pl-10"
        />
      </div>

      {allItems.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-base font-medium">
            {search ? "No matching items found" : "No documents or contracts available"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Try adjusting your search terms"
              : "Upload documents or create contracts to get started"}
          </p>
        </Card>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="grid gap-3">
            {allItems.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                  "p-4"
                )}
                onClick={() => onSelectDocument(item, item.type === "contract")}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                      item.type === "contract"
                        ? "bg-blue-100 dark:bg-blue-950"
                        : "bg-green-100 dark:bg-green-950"
                    )}
                  >
                    {item.type === "contract" ? (
                      <FileCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">
                        {item.title || item.name}
                      </h3>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {item.type === "contract" ? "Contract" : "Document"}
                      </Badge>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {item.contract_type && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                          {item.contract_type}
                        </span>
                      )}
                      {item.status && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                          {item.status}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
