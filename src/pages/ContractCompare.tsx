import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, AlertCircle, Eye, Download, Zap } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ComparisonResult {
  differences: {
    type: 'added' | 'removed' | 'modified';
    section: string;
    page: number;
    line: number;
    content: string;
    severity: 'high' | 'medium' | 'low';
  }[];
  summary: {
    totalChanges: number;
    addedSections: number;
    removedSections: number;
    modifiedSections: number;
    riskLevel: 'high' | 'medium' | 'low';
  };
}

export default function ContractCompare() {
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ComparisonResult | null>(null);
  const { toast } = useToast();

  const handleFileUpload = (file: File, type: 'primary' | 'comparison') => {
    if (type === 'primary') {
      setPrimaryFile(file);
    } else {
      setComparisonFile(file);
    }
  };

  const handleCompare = async () => {
    if (!primaryFile || !comparisonFile) return;
    
    setIsAnalyzing(true);

    try {
      // Extract text from files
      const primaryText = await extractTextFromFile(primaryFile);
      const comparisonText = await extractTextFromFile(comparisonFile);

      if (!primaryText || !comparisonText) {
        toast({
          title: "Extraction Failed",
          description: "Could not extract text from one or both documents. Please use text-based formats (.txt, .docx).",
          variant: "destructive"
        });
        setIsAnalyzing(false);
        return;
      }

      // Call the compare-contracts edge function
      const { data, error } = await supabase.functions.invoke('compare-contracts', {
        body: {
          primaryText,
          comparisonText
        }
      });

      if (error) {
        console.error('Comparison error:', error);
        toast({
          title: "Comparison Failed",
          description: error.message || "Failed to compare contracts. Please try again.",
          variant: "destructive"
        });
        setIsAnalyzing(false);
        return;
      }

      setResults(data as ComparisonResult);
      toast({
        title: "Comparison Complete",
        description: `Identified ${data.summary.totalChanges} differences between the contracts.`,
      });
    } catch (error) {
      console.error('Comparison error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during comparison.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractTextFromFile = async (file: File): Promise<string | null> => {
    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        return await file.text();
      } else if (
        file.type === 'application/msword' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        // Basic text extraction for Word docs
        return await file.text();
      } else if (file.type === 'application/pdf') {
        // For PDFs, inform user to use text format
        toast({
          title: "PDF Not Supported",
          description: "Please convert PDF to text format for comparison.",
          variant: "default"
        });
        return null;
      }
      return null;
    } catch (error) {
      console.error('Text extraction error:', error);
      return null;
    }
  };

  const FileUploadZone = ({ 
    onFileUpload, 
    file, 
    label, 
    type 
  }: { 
    onFileUpload: (file: File) => void;
    file: File | null;
    label: string;
    type: 'primary' | 'comparison';
  }) => (
    <Card className="shadow-card">
      <CardContent className="p-6">
        {file ? (
          <div className="text-center space-y-4">
            <FileText className="h-12 w-12 text-primary mx-auto" />
            <div>
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => document.getElementById(`file-${type}`)?.click()}
            >
              Change File
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <div className="space-y-2">
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">
                Upload PDF, DOC, or DOCX file
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById(`file-${type}`)?.click()}
            >
              Choose File
            </Button>
          </div>
        )}
        <input
          id={`file-${type}`}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileUpload(file);
          }}
        />
      </CardContent>
    </Card>
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'removed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'modified':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };


  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-2xl font-semibold">Contract Comparison</h1>
        <p className="text-muted-foreground">
          Compare two contract versions and identify key differences with AI analysis
        </p>
      </div>

      {!results && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-medium">Primary Document</h3>
              <FileUploadZone
                onFileUpload={(file) => handleFileUpload(file, 'primary')}
                file={primaryFile}
                label="Upload primary contract"
                type="primary"
              />
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Comparison Document</h3>
              <FileUploadZone
                onFileUpload={(file) => handleFileUpload(file, 'comparison')}
                file={comparisonFile}
                label="Upload new version"
                type="comparison"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              onClick={handleCompare}
              disabled={!primaryFile || !comparisonFile || isAnalyzing}
              className="px-8"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analyzing Contracts...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Compare with AI
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Comparison Summary
                <Badge variant="outline" className={getSeverityColor(results.summary.riskLevel)}>
                  {results.summary.riskLevel.toUpperCase()} RISK
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-primary">{results.summary.totalChanges}</div>
                  <div className="text-sm text-muted-foreground">Total Changes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-blue-600">{results.summary.addedSections}</div>
                  <div className="text-sm text-muted-foreground">Added</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-orange-600">{results.summary.modifiedSections}</div>
                  <div className="text-sm text-muted-foreground">Modified</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-red-600">{results.summary.removedSections}</div>
                  <div className="text-sm text-muted-foreground">Removed</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Detailed Differences</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    View Side-by-Side
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="all">All Changes ({results.differences.length})</TabsTrigger>
                  <TabsTrigger value="high">High Risk ({results.differences.filter(d => d.severity === 'high').length})</TabsTrigger>
                  <TabsTrigger value="medium">Medium Risk ({results.differences.filter(d => d.severity === 'medium').length})</TabsTrigger>
                  <TabsTrigger value="low">Low Risk ({results.differences.filter(d => d.severity === 'low').length})</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-4">
                  {results.differences.map((diff, index) => (
                    <Card key={index} className="border">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{diff.section}</h4>
                                <Badge variant="outline" className={getTypeColor(diff.type)}>
                                  {diff.type}
                                </Badge>
                                <Badge variant="outline" className={getSeverityColor(diff.severity)}>
                                  {diff.severity} risk
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Page {diff.page}, Line {diff.line}
                              </div>
                            </div>
                            {diff.severity === 'high' && (
                              <AlertCircle className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                          <p className="text-sm bg-muted/50 p-3 rounded-lg">
                            {diff.content}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="high" className="space-y-4">
                  {results.differences.filter(d => d.severity === 'high').map((diff, index) => (
                    <Card key={index} className="border border-red-200">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{diff.section}</h4>
                                <Badge variant="outline" className={getTypeColor(diff.type)}>
                                  {diff.type}
                                </Badge>
                                <Badge variant="outline" className={getSeverityColor(diff.severity)}>
                                  {diff.severity} risk
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Page {diff.page}, Line {diff.line}
                              </div>
                            </div>
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          </div>
                          <p className="text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                            {diff.content}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="medium" className="space-y-4">
                  {results.differences.filter(d => d.severity === 'medium').map((diff, index) => (
                    <Card key={index} className="border border-yellow-200">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{diff.section}</h4>
                                <Badge variant="outline" className={getTypeColor(diff.type)}>
                                  {diff.type}
                                </Badge>
                                <Badge variant="outline" className={getSeverityColor(diff.severity)}>
                                  {diff.severity} risk
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Page {diff.page}, Line {diff.line}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            {diff.content}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="low" className="space-y-4">
                  {results.differences.filter(d => d.severity === 'low').map((diff, index) => (
                    <Card key={index} className="border border-green-200">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{diff.section}</h4>
                                <Badge variant="outline" className={getTypeColor(diff.type)}>
                                  {diff.type}
                                </Badge>
                                <Badge variant="outline" className={getSeverityColor(diff.severity)}>
                                  {diff.severity} risk
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Page {diff.page}, Line {diff.line}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm bg-green-50 p-3 rounded-lg border border-green-200">
                            {diff.content}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => {
                setResults(null);
                setPrimaryFile(null);
                setComparisonFile(null);
              }}
            >
              Compare New Documents
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}