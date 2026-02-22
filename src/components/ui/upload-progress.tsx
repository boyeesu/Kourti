import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { X, CheckCircle2, AlertCircle, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadFile {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

interface UploadProgressProps {
  files: UploadFile[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  className?: string;
}

export function UploadProgress({ files, onRemove, onRetry, className }: UploadProgressProps) {
  if (files.length === 0) return null;

  return (
    <Card className={cn("border", className)}>
      <CardContent className="p-4 space-y-3">
        {files.map((file) => (
          <div key={file.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium truncate">{file.name}</span>
                {file.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                )}
                {file.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                )}
              </div>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {file.status === "uploading" && (
              <Progress value={file.progress} className="h-2" />
            )}
            {file.status === "error" && (
              <div className="space-y-2">
                <p className="text-xs text-destructive">{file.error || "Upload failed"}</p>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(file.id)}
                    className="h-7 text-xs"
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
            {file.status === "success" && (
              <p className="text-xs text-success">Upload complete</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

