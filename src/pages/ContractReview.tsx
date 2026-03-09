import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileText, Bot, Target, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';
import { useToast } from '@/hooks/use-toast';
import { useCreateContract } from '@/hooks/useContracts';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  ContractAnalysisView,
  parseAnalysisToFindings,
  type AnalysisFinding,
  type AnalysisRecap,
} from '@/components/ream-ai/ContractAnalysisView';

const goalSuggestions = [
  'Find potential risks and liabilities',
  'Identify missing or unclear terms',
  'Review payment and termination clauses',
  'Check for compliance issues',
  'Analyze intellectual property terms',
  'Review liability and indemnification',
  'Assess force majeure provisions',
  'Evaluate confidentiality terms',
];

const STRUCTURED_ANALYSIS_PROMPT = `Analyze this contract and return your findings in the following JSON format wrapped in \`\`\`json code blocks:

\`\`\`json
{
  "summary": "2-3 sentence executive summary of the contract",
  "riskScore": <number 0-100>,
  "findings": [
    {
      "severity": "critical|warning|info|positive",
      "title": "Short title of the finding",
      "description": "Detailed explanation of the finding and its implications",
      "matchText": "Exact quote from the contract that this finding references",
      "recommendation": "Specific actionable recommendation to address this finding",
      "section": "Section/clause reference (e.g., 'Section 4.2 - Termination')",
      "category": "Category (e.g., 'Liability', 'Termination', 'IP', 'Payment', 'Confidentiality', 'Compliance')"
    }
  ]
}
\`\`\`

IMPORTANT:
- matchText MUST be an exact quote from the document (copy-paste, not paraphrased)
- Include at least 8-15 findings covering risks, concerns, and positive aspects
- Be specific in recommendations - don't just say "review this", suggest actual changes
- Categorize findings appropriately
- riskScore: 0-30 = low risk, 31-60 = moderate, 61-100 = high risk`;

export default function ContractReview() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [analysisType, setAnalysisType] = useState<
    'contract_review' | 'document_review' | 'key_information'
  >('contract_review');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [findings, setFindings] = useState<AnalysisFinding[]>([]);
  const [recap, setRecap] = useState<AnalysisRecap | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const { toast } = useToast();
  const createContractMutation = useCreateContract();

  const hasResults = findings.length > 0 && recap;

  // Extract text from uploaded file
  const handleFileUpload = useCallback(
    async (uploadedFile: File) => {
      // Validate file before processing
      const { validateFile, MAX_CONTRACT_FILE_SIZE } = await import('@/lib/fileValidation');
      const validation = validateFile(uploadedFile, { maxSize: MAX_CONTRACT_FILE_SIZE });
      if (!validation.valid) {
        toast({ title: 'Invalid File', description: validation.error, variant: 'destructive' });
        return;
      }

      setFile(uploadedFile);
      setIsExtracting(true);

      try {
        let extracted = '';

        // Client-side extraction for text files
        if (
          uploadedFile.type === 'text/plain' ||
          uploadedFile.name.toLowerCase().endsWith('.txt')
        ) {
          extracted = await uploadedFile.text();
        }
        // Client-side DOCX extraction
        else if (uploadedFile.name.toLowerCase().endsWith('.docx')) {
          try {
            const mammoth = await import('mammoth');
            const arrayBuffer = await uploadedFile.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            extracted = result.value;
          } catch (e) {
            console.error('DOCX extraction failed:', e);
          }
        }

        // If client-side extraction didn't work, try server-side
        if (!extracted || extracted.length < 10) {
          // Upload temporarily to extract text
          const formData = new FormData();
          formData.append('file', uploadedFile);

          // Read as base64 for inline extraction attempt
          const reader = new FileReader();
          const textPromise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const text = reader.result as string;
              resolve(text);
            };
            reader.onerror = () => resolve('');
            reader.readAsText(uploadedFile);
          });

          const rawText = await textPromise;
          if (rawText && rawText.length > 50 && !rawText.includes('\x00')) {
            extracted = rawText;
          }
        }

        if (extracted && extracted.length > 10) {
          setTextContent(extracted);
          setDocumentContent(extracted);
          toast({
            title: 'Text Extracted',
            description: `Extracted ${extracted.length.toLocaleString()} characters from "${uploadedFile.name}".`,
          });
        } else {
          toast({
            title: 'Extraction Limited',
            description:
              'Could not extract text automatically. Please paste the contract text manually.',
            variant: 'default',
          });
        }
      } catch (error) {
        console.error('File extraction error:', error);
        toast({
          title: 'Extraction Failed',
          description: 'Could not read the file. Please paste the text manually.',
          variant: 'destructive',
        });
      } finally {
        setIsExtracting(false);
      }
    },
    [toast]
  );

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
    const content = textContent.trim();
    if (!content && !file) {
      toast({
        title: 'Missing Content',
        description: 'Please upload a document or paste text to analyze.',
        variant: 'destructive',
      });
      return;
    }

    if (!content || content.length < 50) {
      toast({
        title: 'Insufficient Content',
        description: 'Please provide more text content for a meaningful analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setProgressLabel('Preparing document for analysis...');
    setDocumentContent(content);

    try {
      setAnalysisProgress(25);
      setProgressLabel('Sending to REAM AI for analysis...');

      const goalText =
        goal ||
        'Provide a comprehensive contract review identifying risks, obligations, and areas of concern';
      const payload = {
        text: content,
        goal: `${goalText}\n\n${STRUCTURED_ANALYSIS_PROMPT}`,
        analysisType: resolveAnalysisType(),
      };

      setAnalysisProgress(40);
      setProgressLabel('AI is reviewing the contract...');

      const { data, error } = await invokeFunctionWithCsrf<{ analysis?: string }>(
        'advanced-contract-analysis',
        {
          body: payload,
        }
      );

      let analysisText = '';

      if (error) {
        setAnalysisProgress(50);
        setProgressLabel('Trying fallback analysis...');
        const fallback = await invokeFunctionWithCsrf<{ analysis?: string }>('contract-analysis', {
          body: payload,
        });
        if (fallback.error) throw fallback.error;
        analysisText = fallback.data?.analysis || '';
      } else {
        analysisText = data?.analysis || '';
      }

      if (!analysisText) {
        throw new Error('No analysis returned from AI service');
      }

      setAnalysisProgress(80);
      setProgressLabel('Parsing findings and building analysis view...');

      // Parse the analysis into structured findings
      const parsed = parseAnalysisToFindings(analysisText, content);
      setFindings(parsed.findings);
      setRecap(parsed.recap);

      setAnalysisProgress(100);
      setProgressLabel('Analysis complete!');

      toast({
        title: 'Analysis Complete',
        description: `Found ${parsed.findings.length} findings across ${parsed.recap.categories.length} categories.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to analyze document',
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress(0);
      }, 500);
    }
  };

  const handleApplyRecommendation = (findingId: string, newText: string) => {
    const finding = findings.find((f) => f.id === findingId);
    if (!finding || !finding.matchText) return;

    const updated = documentContent.replace(finding.matchText, newText);
    if (updated !== documentContent) {
      setDocumentContent(updated);
      setTextContent(updated);
      toast({
        title: 'Recommendation Applied',
        description: `Updated the contract text for: ${finding.title.substring(0, 40)}...`,
      });
    }
  };

  const handleEditDocument = (updatedContent: string) => {
    setDocumentContent(updatedContent);
    setTextContent(updatedContent);
    toast({ title: 'Document Updated', description: 'Your changes have been saved.' });
  };

  const handleExport = async () => {
    if (!recap) return;
    const exportText = [
      `CONTRACT ANALYSIS REPORT`,
      `=======================`,
      `Document: ${file?.name || 'Pasted Content'}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Risk Score: ${recap.riskScore}/100 (${recap.riskScore <= 30 ? 'Low' : recap.riskScore <= 60 ? 'Moderate' : 'High'} Risk)`,
      ``,
      `EXECUTIVE SUMMARY`,
      recap.summary,
      ``,
      `FINDINGS (${recap.totalFindings} total)`,
      `- Critical: ${recap.criticalCount}`,
      `- Warnings: ${recap.warningCount}`,
      `- Info: ${recap.infoCount}`,
      `- Positive: ${recap.positiveCount}`,
      ``,
      ...findings.map((f, i) =>
        [
          `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`,
          `   Category: ${f.category}`,
          f.section ? `   Section: ${f.section}` : '',
          `   ${f.description}`,
          f.recommendation ? `   Recommendation: ${f.recommendation}` : '',
          '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(exportText);
      toast({ title: 'Exported', description: 'Analysis report copied to clipboard.' });
    } catch {
      // Fallback: download as file
      const blob = new Blob([exportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-analysis-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSaveAsContract = async () => {
    if (!recap) return;
    try {
      const contractTitle =
        file?.name?.replace(/\.[^/.]+$/, '') ||
        `AI Reviewed Contract - ${new Date().toLocaleDateString()}`;
      await createContractMutation.mutateAsync({
        title: contractTitle,
        description: goal || 'AI-generated contract review',
        terms: documentContent,
        status: 'active',
        contract_type: analysisType === 'contract_review' ? 'service' : 'general',
      });
      toast({ title: 'Contract Saved', description: 'Contract has been saved successfully.' });
    } catch {
      // Error toast handled by mutation
    }
  };

  const handleReset = () => {
    setFindings([]);
    setRecap(null);
    setFile(null);
    setTextContent('');
    setDocumentContent('');
    setGoal('');
    setSelectedGoal('');
  };

  // --- Analysis View (side-by-side) ---
  if (hasResults && documentContent) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] -mx-3 -my-3 sm:-mx-4 lg:-mx-6 lg:-my-4">
        {/* Compact top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8" onClick={handleReset}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              New Analysis
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleSaveAsContract}
            >
              Save as Contract
            </Button>
          </div>
        </div>

        {/* Full-height analysis view */}
        <div className="flex-1 min-h-0">
          <ContractAnalysisView
            documentContent={documentContent}
            documentTitle={file?.name || 'Contract Analysis'}
            findings={findings}
            recap={recap}
            onApplyRecommendation={handleApplyRecommendation}
            onEditDocument={handleEditDocument}
            onExport={handleExport}
          />
        </div>
      </div>
    );
  }

  // --- Upload & Configuration View ---
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <Breadcrumbs />

      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-primary to-primary/80 p-3 rounded-lg">
          <Bot className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">REAM AI Contract Review</h1>
          <p className="text-muted-foreground text-sm">
            AI-powered legal document analysis with side-by-side review
          </p>
        </div>
      </div>

      {/* Progress bar during analysis */}
      {isAnalyzing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-medium">{progressLabel}</p>
                <Progress value={analysisProgress} className="mt-2 h-2" />
              </div>
              <span className="text-xs text-muted-foreground">{analysisProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-5">
        {/* Analysis Type + Goal - compact layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Analysis Type
            </label>
            <Select
              value={analysisType}
              onValueChange={(value: string) =>
                setAnalysisType(value as 'contract_review' | 'document_review' | 'key_information')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract_review">Contract Review & Risk Assessment</SelectItem>
                <SelectItem value="document_review">General Document Analysis</SelectItem>
                <SelectItem value="key_information">Key Information Extraction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Custom Goal
            </label>
            <Textarea
              placeholder="What should REAM AI focus on?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="min-h-[38px] h-[38px] resize-none"
            />
          </div>
        </div>

        {/* Quick Goals */}
        <div className="flex flex-wrap gap-1.5">
          {goalSuggestions.map((suggestion) => (
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

        {/* Document Input - upload or paste */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {file ? (
                <div className="p-6 text-center space-y-3">
                  <FileText className="h-10 w-10 text-primary mx-auto" />
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {isExtracting && (
                        <span className="ml-2 text-primary">
                          <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                          Extracting text...
                        </span>
                      )}
                      {!isExtracting && textContent && (
                        <span className="ml-2 text-green-600">
                          {textContent.length.toLocaleString()} chars extracted
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    Change File
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="w-full p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium text-sm">Upload Contract</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, DOCX, TXT supported
                  </p>
                </button>
              )}
              <input
                id="file-upload"
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
                placeholder="Or paste your contract text here..."
                value={textContent}
                onChange={(e) => {
                  setTextContent(e.target.value);
                  setDocumentContent(e.target.value);
                }}
                className="min-h-[180px] rounded-none border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* Analyze Button */}
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
    </div>
  );
}
