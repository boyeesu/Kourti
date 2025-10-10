import { useState } from "react";
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
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          Select Document
        </h3>
        <p className="text-xs text-muted-foreground">
          Choose from your knowledge base for AI-powered analysis
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents and contracts..."
          className="h-8 pl-8 text-xs"
        />
      </div>

      {allItems.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-sm font-medium">
            {search ? "No matching items found" : "No documents available"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {search
              ? "Try adjusting your search"
              : "Upload documents to get started"}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[320px]">
          <div className="space-y-2">
            {allItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-all hover:bg-muted hover:border-primary/50",
                )}
                onClick={() => onSelectDocument(item, item.type === "contract")}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
                      item.type === "contract"
                        ? "bg-blue-100 dark:bg-blue-950"
                        : "bg-green-100 dark:bg-green-950"
                    )}
                  >
                    {item.type === "contract" ? (
                      <FileCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-medium text-xs truncate">
                        {item.title || item.name}
                      </h4>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                        {item.type === "contract" ? "Contract" : "Document"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
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
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
