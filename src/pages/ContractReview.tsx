import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Bot, Target, Sparkles, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

interface AnalysisResult {
  analysis: string;
  persona?: string;
  analysisType?: string;
  success?: boolean;
  tokensUsed?: number;
}

const goalSuggestions = [
  "Find potential risks and liabilities",
  "Identify missing or unclear terms",
  "Review payment and termination clauses",
  "Check for compliance issues",
  "Analyze intellectual property terms",
  "Review liability and indemnification",
  "Assess force majeure provisions",
  "Evaluate confidentiality terms"
];

export default function ContractReview() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedGoal, setSelectedGoal] = useState("");
  const [analysisType, setAnalysisType] = useState<"contract_review" | "document_review" | "key_information">("contract_review");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const normalizeResult = (raw: any): AnalysisResult => {
    const analysis = raw?.analysis;
    if (!analysis) {
      throw new Error('No analysis returned from AI service');
    }

    return {
      analysis,
      persona: raw?.persona,
      analysisType: raw?.analysisType,
      success: raw?.success,
      tokensUsed: raw?.tokensUsed,
    };
  };

  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    // In a real app, you'd extract text from the file
    // For now, we'll use placeholder text
    setTextContent(`Contract content from ${uploadedFile.name} would be extracted here...`);
  };

  const handleGoalSelect = (selectedValue: string) => {
    setSelectedGoal(selectedValue);
    setGoal(selectedValue);
  };

  const resolveAnalysisType = () => {
    switch (analysisType) {
      case 'contract_review':
      case 'document_review':
        return 'general' as const;
      case 'key_information':
        return 'extract' as const;
      default:
        return 'general' as const;
    }
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
      const payload = {
        text: textContent || `Sample contract content from ${file?.name}`,
        goal: goal || "Provide a comprehensive contract review",
        analysisType: resolveAnalysisType(),
      };

      const { data, error } = await supabase.functions.invoke('advanced-contract-analysis', {
        body: payload,
      });

      if (error) {
        const fallback = await supabase.functions.invoke('contract-analysis', {
          body: payload,
        });

        if (fallback.error) throw fallback.error;
        setResult(normalizeResult(fallback.data));
      } else {
        setResult(normalizeResult(data));
      }
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

  const getAnalysisTypeIcon = () => {
    switch (analysisType) {
      case 'contract_review':
        return <FileText className="h-5 w-5" />;
      case 'document_review':
        return <FileText className="h-5 w-5" />;
      case 'key_information':
        return <Target className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
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
              <p className="font-medium">Upload Contract or Document</p>
              <p className="text-sm text-muted-foreground">
                PDF, DOC, DOCX files supported
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
        <div className="bg-gradient-to-br from-primary to-primary/80 p-3 rounded-lg">
          <Bot className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">REAM AI Contract Review</h1>
          <p className="text-muted-foreground">
            AI-powered legal document analysis and risk assessment
          </p>
        </div>
      </div>

      {!result && (
        <div className="space-y-6">
          {/* Analysis Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getAnalysisTypeIcon()}
                Analysis Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={analysisType} onValueChange={(value: any) => setAnalysisType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract_review">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Contract Review & Risk Assessment
                    </div>
                  </SelectItem>
                  <SelectItem value="document_review">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      General Document Analysis
                    </div>
                  </SelectItem>
                  <SelectItem value="key_information">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Key Information Extraction
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Goal Setting */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Analysis Goal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Quick Goals</label>
                <div className="flex flex-wrap gap-2">
                  {goalSuggestions.map((suggestion) => (
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
                <label className="text-sm font-medium mb-2 block">Custom Goal</label>
                <Textarea
                  placeholder="Describe what you want REAM AI to focus on..."
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
                    placeholder="Paste your contract or document text here..."
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
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-br from-primary to-primary/80 p-2 rounded-lg">
                    <Bot className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Analysis Complete</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      by {result.persona ?? "REAM AI"} • {(result.analysisType ?? resolveAnalysisType()).replace('_', ' ')}
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
              Export Analysis
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}