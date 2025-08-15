import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Bot, Target, Sparkles, CheckCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

interface AnalysisResult {
  analysis: string;
  persona: string;
  analysisType: string;
}

const documentGoalSuggestions = [
  "Extract all important dates and deadlines",
  "Identify key parties and their roles",
  "Summarize main obligations and requirements",
  "Find financial terms and amounts",
  "Check for compliance requirements",
  "Identify action items and next steps",
  "Extract contact information",
  "Analyze document structure and completeness"
];

export default function DocumentReview() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedGoal, setSelectedGoal] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    // In a real app, you'd extract text from the file
    setTextContent(`Document content from ${uploadedFile.name} would be extracted here...`);
  };

  const handleGoalSelect = (selectedValue: string) => {
    setSelectedGoal(selectedValue);
    setGoal(selectedValue);
  };

  const handleAnalyze = async () => {
    if (!textContent && !file) {
      toast({
        title: "Missing Content",
        description: "Please upload a document or paste text to analyze.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('contract-analysis-ai', {
        body: {
          text: textContent || `Sample document content from ${file?.name}`,
          goal: goal || "General document analysis",
          analysisType: 'document_review'
        }
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: "Analysis Complete",
        description: "REAM AI has finished analyzing your document.",
      });
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze document",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const FileUploadZone = () => (
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
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              Change File
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <div className="space-y-2">
              <p className="font-medium">Upload Legal Document</p>
              <p className="text-sm text-muted-foreground">
                PDF, DOC, DOCX, TXT files supported
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>
          </div>
        )}
        <input
          id="file-upload"
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-lg">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">REAM AI Document Review</h1>
          <p className="text-muted-foreground">
            Intelligent analysis and key information extraction from legal documents
          </p>
        </div>
      </div>

      {!result && (
        <div className="space-y-6">
          {/* Analysis Goal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Analysis Focus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Common Analysis Goals</label>
                <div className="flex flex-wrap gap-2">
                  {documentGoalSuggestions.map((suggestion) => (
                    <Badge
                      key={suggestion}
                      variant={selectedGoal === suggestion ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary/10"
                      onClick={() => handleGoalSelect(suggestion)}
                    >
                      {suggestion}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Analysis Goal</label>
                <Textarea
                  placeholder="Tell REAM AI what specific information you need from this document..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Document Upload */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-medium">Upload Document</h3>
              <FileUploadZone />
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Or Paste Text</h3>
              <Card className="shadow-card">
                <CardContent className="p-6">
                  <Textarea
                    placeholder="Paste your document text here for analysis..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="min-h-[200px] resize-none"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Analyze Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleAnalyze}
              disabled={(!textContent && !file) || isAnalyzing}
              size="lg"
              className="px-8"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  REAM AI is analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze with REAM AI
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <Card className="border-blue-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-lg">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Document Analysis Complete</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      by {result.persona} • Document Review & Analysis
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Complete
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {result.analysis}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setFile(null);
                setTextContent("");
                setGoal("");
                setSelectedGoal("");
              }}
            >
              Analyze New Document
            </Button>
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              View Full Report
            </Button>
            <Button variant="outline">
              Export Analysis
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}