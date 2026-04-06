import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  Upload,
  FileText,
  Bot,
  Target,
  Sparkles,
  Loader2,
  ArrowLeft,
  X,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import { getNodeDocumentSignedUrl, invokeNodeApi } from '@/lib/backendApi';
import { getAccessToken, refreshSession } from '@/lib/authClient';
import { downloadDocument } from '@/lib/fileApi';
import { toast } from 'sonner';
import { useCreateContract } from '@/hooks/useContracts';
import {
  ContractAnalysisView,
  parseAnalysisToFindings,
  type AnalysisFinding,
  type AnalysisRecap,
  type FindingDecision,
} from '@/components/ream-ai/ContractAnalysisView';
import { CONTRACT_REVIEW_GOAL_SUGGESTIONS } from '@/components/ream-ai/analysisPresets';

export default function ContractReview() {
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [analysisType, setAnalysisType] = useState<
    'contract_review' | 'document_review' | 'key_information'
  >('contract_review');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [findings, setFindings] = useState<AnalysisFinding[]>([]);
  const [recap, setRecap] = useState<AnalysisRecap | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, FindingDecision>>({});
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const createContractMutation = useCreateContract();

  const handleDecision = (findingId: string, decision: FindingDecision) => {
    setDecisions((prev) => ({ ...prev, [findingId]: decision }));
  };

  const hasResults = findings.length > 0 && recap;
  const hasDocument = textContent.trim().length > 50 || file;

  // Auto-load content from contractId or documentId query params
  useEffect(() => {
    const contractId = searchParams.get('contractId');
    const documentId = searchParams.get('documentId');

    let cancelled = false;

    const loadSource = async () => {
      if (contractId) {
        setIsLoadingSource(true);

        try {
          const data = await invokeNodeApi<{ title: string; terms?: string }>(
            `/api/v1/contracts/${contractId}`
          );

          if (cancelled) return;

          if (data.terms) {
            setTextContent(data.terms);
            setDocumentContent(data.terms);
            toast.success('Contract Loaded', {
              description: `Loaded "${data.title}" for review.`,
            });
          }
        } catch (error) {
          if (!cancelled) {
            toast.error('Failed to load contract', {
              description: error instanceof Error ? error.message : 'Contract not found.',
            });
          }
        } finally {
          if (!cancelled) {
            setIsLoadingSource(false);
          }
        }

        return;
      }

      if (!documentId) {
        return;
      }

      setIsLoadingSource(true);
      setAnalysisType('document_review');

      try {
        const data = await invokeNodeApi<{
          id: string;
          name: string;
          content?: string;
          file_path?: string;
          mime_type?: string;
        }>(`/api/v1/documents/${documentId}`);

        if (!data) {
          toast.error('Failed to load document', {
            description: 'Document not found.',
          });
          return;
        }

        if (data.content && data.content.length > 10) {
          if (!cancelled) {
            setTextContent(data.content);
            setDocumentContent(data.content);
            toast.success('Document Loaded', { description: `Loaded "${data.name}" for review.` });
          }
          return;
        }

        if (!data.file_path) {
          return;
        }

        let fileData: Blob | null = null;

        try {
          const signed = await getNodeDocumentSignedUrl(data.id, {
            disposition: 'inline',
            expiresIn: 600,
          });
          const response = await fetch(signed.signedUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch document file (${response.status})`);
          }
          fileData = await response.blob();
        } catch {
          // Fallback to direct download
          fileData = await downloadDocument(data.file_path);
        }

        if (!fileData) {
          return;
        }

        let extracted = '';
        const fileName = data.name || data.file_path;

        if (data.mime_type === 'text/plain' || fileName.toLowerCase().endsWith('.txt')) {
          extracted = await fileData.text();
        } else if (fileName.toLowerCase().endsWith('.docx')) {
          try {
            const mammoth = await import('mammoth');
            const arrayBuffer = await fileData.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            extracted = result.value;
          } catch {
            // DOCX extraction failed
          }
        } else {
          const rawText = await fileData.text();
          if (rawText && rawText.length > 50 && !rawText.includes('\x00')) {
            extracted = rawText;
          }
        }

        if (cancelled) {
          return;
        }

        if (extracted && extracted.length > 10) {
          setTextContent(extracted);
          setDocumentContent(extracted);
          toast.success('Document Loaded', {
            description: `Loaded "${data.name}" for review.`,
          });
        } else {
          toast.success('Could not extract text', {
            description:
              'The document format is not supported for automatic extraction. Please paste the text manually.',
          });
        }
      } catch (error) {
        if (!cancelled) {
          toast.error('Download Failed', {
            description:
              error instanceof Error
                ? error.message
                : 'Could not download the document from storage.',
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSource(false);
        }
      }
    };

    void loadSource();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Extract text from uploaded file
  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    const { validateFile, MAX_CONTRACT_FILE_SIZE } = await import('@/lib/fileValidation');
    const validation = validateFile(uploadedFile, { maxSize: MAX_CONTRACT_FILE_SIZE });
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
      } else if (
        uploadedFile.type === 'application/pdf' ||
        uploadedFile.name.toLowerCase().endsWith('.pdf')
      ) {
        try {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();

          const arrayBuffer = await uploadedFile.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pageTexts: string[] = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item) => ('str' in item ? item.str : '') || '')
              .join(' ');
            pageTexts.push(pageText);
          }

          extracted = pageTexts.join('\n\n');
        } catch (e) {
          console.error('PDF extraction failed:', e);
        }
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

      if (!extracted || extracted.length < 10) {
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
        // Only use raw text if it's actually readable (not binary like PDF)
        if (
          rawText &&
          rawText.length > 50 &&
          !rawText.includes('\x00') &&
          !rawText.startsWith('%PDF')
        ) {
          extracted = rawText;
        }
      }

      if (extracted && extracted.length > 10) {
        setTextContent(extracted);
        setDocumentContent(extracted);
        toast.success('Text Extracted', {
          description: `Extracted ${extracted.length.toLocaleString()} characters from "${uploadedFile.name}".`,
        });
      } else {
        toast.success('Extraction Limited', {
          description:
            'Could not extract text automatically. Please paste the contract text manually.',
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

  const handleGoalToggle = (suggestion: string) => {
    setSelectedGoals((prev) =>
      prev.includes(suggestion) ? prev.filter((g) => g !== suggestion) : [...prev, suggestion]
    );
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
      toast.error('Missing Content', {
        description: 'Please upload a document or paste text to analyze.',
      });
      return;
    }

    if (!content || content.length < 50) {
      toast.error('Insufficient Content', {
        description: 'Please provide more text content for a meaningful analysis.',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setProgressLabel('Preparing document for analysis...');
    setDocumentContent(content);

    try {
      const combinedGoals = [...selectedGoals, goal].filter(Boolean).join('. ');
      const goalText =
        combinedGoals ||
        'Provide a comprehensive contract review identifying risks, obligations, and areas of concern';
      const payload = {
        text: content,
        goal: goalText,
        analysisType: resolveAnalysisType(),
        stream: true,
      };

      // Verify authentication before proceeding
      let accessToken = getAccessToken();
      if (!accessToken) {
        try {
          const session = await refreshSession();
          accessToken = session.accessToken;
        } catch {
          throw new Error('Authentication required. Please sign in again.');
        }
      }

      setAnalysisProgress(20);
      setProgressLabel('Connecting to REAM AI...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(
        new URL('/api/v1/ai/advanced-contract-analysis', env.BACKEND_API_URL).toString(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          credentials: 'include',
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(
          errData?.error || errData?.message || `Analysis failed (${response.status})`
        );
      }

      setAnalysisProgress(40);
      setProgressLabel('REAM AI is analyzing your document...');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let analysisText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);

          try {
            const event = JSON.parse(jsonStr) as
              | { type: 'delta'; content: string }
              | { type: 'done'; tokensUsed: number; modelUsed: string }
              | { type: 'error'; error: string };

            if (event.type === 'delta') {
              analysisText += event.content;
              // Update progress based on content length growth
              const progress = Math.min(80, 40 + analysisText.length / 100);
              setAnalysisProgress(progress);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }

      if (!analysisText) {
        throw new Error('Analysis returned empty results. Please try again.');
      }

      setAnalysisProgress(85);
      setProgressLabel('Parsing findings and building analysis view...');

      const parsed = parseAnalysisToFindings(analysisText, content);
      setFindings(parsed.findings);
      setRecap(parsed.recap);

      setAnalysisProgress(100);
      setProgressLabel('Analysis complete!');

      toast.success('Analysis Complete', {
        description: `Found ${parsed.findings.length} findings across ${parsed.recap.categories.length} categories.`,
      });
    } catch (error: unknown) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Analysis request timed out. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Failed to analyze document';
      toast.error('Analysis Failed', { description: message });
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
      toast.success('Recommendation Applied', {
        description: `Updated the contract text for: ${finding.title.substring(0, 40)}...`,
      });
    }
  };

  const handleEditDocument = (updatedContent: string) => {
    setDocumentContent(updatedContent);
    setTextContent(updatedContent);
    toast.success('Document Updated', { description: 'Your changes have been saved.' });
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
      toast.success('Exported', { description: 'Analysis report copied to clipboard.' });
    } catch {
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
      // Apply all accepted recommendations to the document content before saving
      let finalContent = documentContent;
      const acceptedFindings = findings.filter(
        (f) => decisions[f.id] === 'accepted' && f.matchText && f.recommendation
      );

      for (const finding of acceptedFindings) {
        finalContent = finalContent.replace(finding.matchText, finding.recommendation!);
      }

      const contractTitle =
        file?.name?.replace(/\.[^/.]+$/, '') ||
        `AI Reviewed Contract - ${new Date().toLocaleDateString()}`;
      await createContractMutation.mutateAsync({
        title: contractTitle,
        description: goal || selectedGoals.join(', ') || 'AI-generated contract review',
        terms: finalContent,
        status: 'active',
        contract_type: analysisType === 'contract_review' ? 'service' : 'general',
      });

      const editCount = acceptedFindings.length;
      toast.success('Contract Saved', {
        description:
          editCount > 0
            ? `Contract saved with ${editCount} accepted edit${editCount !== 1 ? 's' : ''} applied.`
            : 'Contract has been saved successfully.',
      });
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
    setSelectedGoals([]);
    setDecisions({});
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) handleFileUpload(droppedFile);
    },
    [handleFileUpload]
  );

  // --- Step 2: Full-viewport Analysis View ---
  if (hasResults && documentContent) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* Compact top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleReset}>
              <ArrowLeft className="h-4 w-4" />
              New Analysis
            </Button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              <span>{file?.name || 'Contract Analysis'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Object.values(decisions).filter((d) => d === 'accepted').length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {Object.values(decisions).filter((d) => d === 'accepted').length} edit
                {Object.values(decisions).filter((d) => d === 'accepted').length !== 1
                  ? 's'
                  : ''}{' '}
                accepted
              </Badge>
            )}
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
            decisions={decisions}
            onDecision={handleDecision}
          />
        </div>
      </div>
    );
  }

  // --- Analyzing overlay ---
  if (isAnalyzing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Analyzing your document</h2>
            <p className="text-sm text-muted-foreground">{progressLabel}</p>
          </div>
          <div className="space-y-1">
            <Progress value={analysisProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{analysisProgress}%</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Step 1: Upload & Configure ---
  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-6 pb-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-gradient-to-br from-primary to-primary/80 p-2.5 rounded-lg">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">REAM AI Contract Review</h1>
              <p className="text-muted-foreground text-sm">
                Upload a document, set your goals, and get a structured AI analysis
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading source document */}
      {isLoadingSource && (
        <div className="px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  <p className="text-sm font-medium">Loading document for review...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 px-4 sm:px-6 pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Step 1: Upload document */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold',
                  hasDocument
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-primary/10 text-primary'
                )}
              >
                {hasDocument ? <CheckCircle2 className="h-3.5 w-3.5" /> : '1'}
              </div>
              <h2 className="text-sm font-semibold">Upload your document</h2>
            </div>

            {file ? (
              /* File uploaded state */
              <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40">
                      <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.name}</p>
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
                            {textContent.length.toLocaleString()} characters extracted
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => {
                        setFile(null);
                        setTextContent('');
                        setDocumentContent('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Drag & drop upload zone */
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Card
                  className={cn(
                    'border-2 border-dashed transition-colors cursor-pointer',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/30'
                  )}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <CardContent className="p-8 text-center">
                    <Upload
                      className={cn(
                        'h-10 w-10 mx-auto mb-3 transition-colors',
                        isDragging ? 'text-primary' : 'text-muted-foreground/60'
                      )}
                    />
                    <p className="font-medium text-sm">
                      {isDragging ? 'Drop your file here' : 'Drag and drop or click to upload'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, DOC, DOCX, TXT - up to 10MB
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Paste text alternative */}
            <div className="relative">
              <div className="absolute inset-x-0 top-0 flex items-center justify-center -translate-y-1/2">
                <span className="bg-background px-2 text-xs text-muted-foreground">
                  or paste text directly
                </span>
              </div>
              <Textarea
                placeholder="Paste your contract or document text here..."
                value={file ? '' : textContent}
                onChange={(e) => {
                  setTextContent(e.target.value);
                  setDocumentContent(e.target.value);
                  if (file) setFile(null);
                }}
                disabled={!!file}
                className="min-h-[120px] resize-none text-sm pt-4"
              />
            </div>

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
          </div>

          {/* Step 2: Set goals */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                2
              </div>
              <h2 className="text-sm font-semibold">Set your analysis goals</h2>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>

            {/* Analysis type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Analysis Type
                </label>
                <Select
                  value={analysisType}
                  onValueChange={(value: string) =>
                    setAnalysisType(
                      value as 'contract_review' | 'document_review' | 'key_information'
                    )
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract_review">
                      Contract Review & Risk Assessment
                    </SelectItem>
                    <SelectItem value="document_review">General Document Analysis</SelectItem>
                    <SelectItem value="key_information">Key Information Extraction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Custom Goal
                </label>
                <Textarea
                  placeholder="Describe what REAM AI should focus on..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="min-h-[36px] h-[36px] resize-none text-sm"
                />
              </div>
            </div>

            {/* Goal chips - multi-select */}
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_REVIEW_GOAL_SUGGESTIONS.map((suggestion) => {
                const isSelected = selectedGoals.includes(suggestion);
                return (
                  <Badge
                    key={suggestion}
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer text-xs transition-colors',
                      isSelected ? '' : 'hover:bg-primary/10 hover:border-primary/50'
                    )}
                    onClick={() => handleGoalToggle(suggestion)}
                  >
                    {isSelected && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {suggestion}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Analyze CTA */}
          <div className="pt-2">
            <Button
              onClick={handleAnalyze}
              disabled={!hasDocument || isAnalyzing || isExtracting || isLoadingSource}
              size="lg"
              className="w-full h-12 text-base"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Analyze with REAM AI
              {selectedGoals.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {selectedGoals.length} goal{selectedGoals.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
