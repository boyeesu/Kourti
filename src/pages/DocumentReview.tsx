import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  Bot,
  Target,
  Sparkles,
  CheckCircle,
  Loader2,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';
import { invokeNodeApi, isNodeBackendEnabled } from '@/lib/backendApi';
import { toast } from 'sonner';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface AnalysisResult {
  analysis: string;
  persona?: string;
  analysisType?: string;
  success?: boolean;
  tokensUsed?: number;
}

const documentGoalSuggestions = [
  'Extract all important dates and deadlines',
  'Identify key parties and their roles',
  'Summarize main obligations and requirements',
  'Find financial terms and amounts',
  'Check for compliance requirements',
  'Identify action items and next steps',
  'Extract contact information',
  'Analyze document structure and completeness',
];

/** Simple markdown-like rendering for analysis text */
function AnalysisContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold mt-4 mb-1">
          {trimmed.slice(4)}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold mt-5 mb-2 text-primary">
          {trimmed.slice(3)}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold mt-5 mb-2">
          {trimmed.slice(2)}
        </h2>
      );
    }
    // Bold headers like **Section Title**
    else if (/^\*\*(.+?)\*\*\s*$/.test(trimmed)) {
      const match = trimmed.match(/^\*\*(.+?)\*\*\s*$/);
      elements.push(
        <h4 key={i} className="text-sm font-semibold mt-4 mb-1">
          {match?.[1]}
        </h4>
      );
    }
    // Bullet points
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const content = trimmed.slice(2);
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-primary mt-1 shrink-0">&#8226;</span>
          <span className="text-sm leading-relaxed">{renderInlineMarkdown(content)}</span>
        </div>
      );
    }
    // Numbered items
    else if (/^\d+[.)]\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)[.)]\s(.+)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2 my-0.5">
            <span className="text-primary font-medium text-sm shrink-0 w-5 text-right">
              {match[1]}.
            </span>
            <span className="text-sm leading-relaxed">{renderInlineMarkdown(match[2])}</span>
          </div>
        );
      }
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed my-0.5">
          {renderInlineMarkdown(trimmed)}
        </p>
      );
    }
  });

  return <div className="space-y-0">{elements}</div>;
}

/** Render inline markdown (bold, italic) */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function DocumentReview() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    // Validate file before processing
    const { validateFile } = await import('@/lib/fileValidation');
    const validation = validateFile(uploadedFile);
    if (!validation.valid) {
      toast.error('Invalid File', { description: validation.error });
      return;
    }

    setFile(uploadedFile);
    setIsExtracting(true);

    try {
      let extracted = '';

      if (uploadedFile.type === 'text/plain' || uploadedFile.name.toLowerCase().endsWith('.txt')) {
        extracted = await uploadedFile.text();
      } else if (uploadedFile.name.toLowerCase().endsWith('.docx')) {
        try {
          const mammoth = await import('mammoth');
          const arrayBuffer = await uploadedFile.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          extracted = result.value;
        } catch (e) {
          console.error('DOCX extraction failed:', e);
        }
      }

      // Fallback: try reading as text
      if (!extracted || extracted.length < 10) {
        const rawText = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsText(uploadedFile);
        });
        if (rawText && rawText.length > 50 && !rawText.includes('\x00')) {
          extracted = rawText;
        }
      }

      if (extracted && extracted.length > 10) {
        setTextContent(extracted);
        toast.success('Text Extracted', {
          description: `Extracted ${extracted.length.toLocaleString()} characters from "${uploadedFile.name}".`,
        });
      } else {
        toast.success('Extraction Limited', {
          description: 'Could not extract text. Please paste the document text manually.',
        });
      }
    } catch (error) {
      console.error('File extraction error:', error);
      toast.error('Extraction Failed', {
        description: 'Could not read the file. Please paste the text manually.',
      });
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleGoalSelect = (selectedValue: string) => {
    setSelectedGoal(selectedValue);
    setGoal(selectedValue);
  };

  const handleAnalyze = async () => {
    const content = textContent.trim();
    if (!content && !file) {
      toast.error('Missing Content', {
        description: 'Please upload a document or paste text to analyze.',
      });
      return;
    }

    if (!content || content.length < 50) {
      toast.error('Insufficient Content', {
        description: 'Please provide more text for meaningful analysis.',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(15);
    setProgressLabel('Preparing document...');

    try {
      setAnalysisProgress(30);
      setProgressLabel('Sending to REAM AI...');

      const payload = {
        text: content,
        goal: goal || 'Provide a comprehensive analysis of this document',
        analysisType: 'general' as const,
      };

      setAnalysisProgress(50);
      setProgressLabel('AI is analyzing the document...');

      if (isNodeBackendEnabled()) {
        const nodeData = await invokeNodeApi<{
          analysis?: string;
          persona?: string;
          analysisType?: string;
          success?: boolean;
          tokensUsed?: number;
        }>('/api/v1/ai/advanced-contract-analysis', {
          method: 'POST',
          body: payload,
        });
        setResult(normalizeResult(nodeData));
      } else {
        const { data, error } = await invokeFunctionWithCsrf<{
          analysis?: string;
          persona?: string;
          analysisType?: string;
          success?: boolean;
          tokensUsed?: number;
        }>('advanced-contract-analysis', {
          body: payload,
        });

        if (error) {
          setAnalysisProgress(60);
          setProgressLabel('Trying fallback...');
          const fallback = await invokeFunctionWithCsrf<{
            analysis?: string;
            persona?: string;
            analysisType?: string;
            success?: boolean;
            tokensUsed?: number;
          }>('contract-analysis-ai', {
            body: payload,
          });
          if (fallback.error) throw fallback.error;
          setResult(normalizeResult(fallback.data));
        } else {
          setResult(normalizeResult(data));
        }
      }

      setAnalysisProgress(100);
      setProgressLabel('Analysis complete!');

      toast.success('Analysis Complete', {
        description: 'REAM AI has finished analyzing your document.',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze document';
      toast.error('Analysis Failed', { description: errorMessage });
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 500);
    }
  };

  const normalizeResult = (
    raw: {
      analysis?: string;
      persona?: string;
      analysisType?: string;
      success?: boolean;
      tokensUsed?: number;
    } | null
  ): AnalysisResult => {
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

  const handleCopy = async () => {
    if (!result?.analysis) return;
    try {
      await navigator.clipboard.writeText(result.analysis);
      toast.success('Copied', { description: 'Analysis copied to clipboard.' });
    } catch {
      toast.error('Copy Failed', { description: 'Could not copy to clipboard.' });
    }
  };

  const handleReset = () => {
    setResult(null);
    setFile(null);
    setTextContent('');
    setGoal('');
    setSelectedGoal('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <Breadcrumbs />

      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-lg">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">REAM AI Document Review</h1>
          <p className="text-muted-foreground text-sm">
            Intelligent analysis and key information extraction
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      {isAnalyzing && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-medium">{progressLabel}</p>
                <Progress value={analysisProgress} className="mt-2 h-2" />
              </div>
              <span className="text-xs text-muted-foreground">{analysisProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {!result && (
        <div className="space-y-5">
          {/* Goals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4" />
                Analysis Focus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {documentGoalSuggestions.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant={selectedGoal === suggestion ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10 text-xs"
                    onClick={() => handleGoalSelect(suggestion)}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
              <Textarea
                placeholder="Or describe what specific information you need..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="min-h-[60px]"
              />
            </CardContent>
          </Card>

          {/* Document input */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {file ? (
                  <div className="p-6 text-center space-y-3">
                    <FileText className="h-10 w-10 text-blue-500 mx-auto" />
                    <div>
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                        {isExtracting && (
                          <span className="ml-2 text-blue-600">
                            <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                            Extracting...
                          </span>
                        )}
                        {!isExtracting && textContent && (
                          <span className="ml-2 text-green-600">
                            {textContent.length.toLocaleString()} chars
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('doc-file-upload')?.click()}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => document.getElementById('doc-file-upload')?.click()}
                    className="w-full p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium text-sm">Upload Document</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, TXT</p>
                  </button>
                )}
                <input
                  id="doc-file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <Textarea
                  placeholder="Or paste your document text here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="min-h-[180px] rounded-none border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-2">
            <Button
              onClick={handleAnalyze}
              disabled={(!textContent.trim() && !file) || isAnalyzing || isExtracting}
              size="lg"
              className="px-10 h-12 text-base"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Analyze with REAM AI
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Results with markdown rendering */}
      {result && (
        <div className="space-y-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-lg">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Document Analysis</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {result.persona ?? 'REAM AI'}
                      {result.tokensUsed ? ` • ${result.tokensUsed.toLocaleString()} tokens` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <Badge
                    variant="outline"
                    className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800 text-xs"
                  >
                    Complete
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  New Analysis
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[600px] w-full rounded-lg border p-5 bg-muted/20">
                <AnalysisContent text={result.analysis} />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
