import React, { useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCreateClient } from "@/hooks/useClients";

interface BulkImportFormProps {
  entityType: "clients" | "cases" | "contracts" | "documents";
  onImportComplete?: (data: any[]) => void;
}

interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

export function BulkImportForm({ entityType, onImportComplete }: BulkImportFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const createClient = useCreateClient();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        toast.error("Please select a CSV file");
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        toast.error("Please select a CSV file");
      }
    }
  };

  const parseCSV = (csvText: string): any[] => {
    const lines = csvText.split("\n").filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      
      data.push(row);
    }

    return data;
  };

  const validateData = (data: any[]): { valid: any[]; errors: string[] } => {
    const valid = [];
    const errors = [];

    // Define required fields for each entity type
    const requiredFields: Record<string, string[]> = {
      clients: ["name"],
      cases: ["name", "client", "status"],
      contracts: ["name", "client", "type"],
      documents: ["name", "type", "linkedCase"]
    };

    const required = requiredFields[entityType] || [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const missingFields = required.filter(field => !row[field] || row[field].trim() === "");
      
      if (missingFields.length > 0) {
        errors.push(`Row ${i + 2}: Missing required fields: ${missingFields.join(", ")}`);
      } else {
        valid.push(row);
      }
    }

    return { valid, errors };
  };

  const processImport = async (data: any[]): Promise<ImportResult> => {
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      setUploadProgress(Math.round((i / data.length) * 100));
      
      try {
        if (entityType === "clients") {
          await createClient.mutateAsync({
            name: item.name,
            email: item.email || undefined,
            phone: item.phone || undefined,
            address: item.address || undefined,
            company: item.company || undefined,
            notes: item.notes || undefined,
            status: item.status || "active",
          });
        }
        // Add other entity types here when implemented
        successful++;
      } catch (error) {
        failed++;
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    
    setUploadProgress(100);
    
    return {
      total: data.length,
      successful,
      failed,
      errors
    };
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setImportResult(null);

    try {
      const csvText = await selectedFile.text();
      const parsedData = parseCSV(csvText);
      
      if (parsedData.length === 0) {
        throw new Error("No valid data found in CSV file");
      }

      const { valid, errors } = validateData(parsedData);
      
      if (errors.length > 0 && valid.length === 0) {
        setImportResult({
          total: parsedData.length,
          successful: 0,
          failed: parsedData.length,
          errors
        });
        setIsUploading(false);
        return;
      }

      const result = await processImport(valid);
      setImportResult({
        ...result,
        errors: [...errors, ...result.errors]
      });

      if (result.successful > 0) {
        toast.success(`Successfully imported ${result.successful} ${entityType}`);
        onImportComplete?.(valid);
      }

    } catch (error) {
      toast.error("Failed to process file");
      setImportResult({
        total: 0,
        successful: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : "Unknown error"]
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setImportResult(null);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload {entityType.charAt(0).toUpperCase() + entityType.slice(1)} CSV
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    className="ml-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium mb-2">
                    Drop your CSV file here, or click to select
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Only CSV files are supported. Maximum file size: 10MB
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileInput}
                  className="hidden"
                  id="csv-upload"
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("csv-upload")?.click()}
                >
                  Select CSV File
                </Button>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="hover-scale"
              >
                {isUploading ? "Importing..." : `Import ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {isUploading && (
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing {entityType}...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.successful > 0 ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{importResult.total}</p>
                <p className="text-sm text-muted-foreground">Total Records</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{importResult.successful}</p>
                <p className="text-sm text-muted-foreground">Successful</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{importResult.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Import Errors:</p>
                    <ul className="text-sm space-y-1">
                      {importResult.errors.slice(0, 5).map((error, index) => (
                        <li key={index} className="text-muted-foreground">• {error}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li className="text-muted-foreground">
                          • ... and {importResult.errors.length - 5} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {importResult.successful > 0 && (
              <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
                <span className="text-sm font-medium text-success">
                  Import completed successfully!
                </span>
                <Badge variant="outline" className="bg-success/10 text-success">
                  {importResult.successful} imported
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}