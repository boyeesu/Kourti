import { useState } from 'react';
import { logError } from '@/lib/logger';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Zap, Loader2 } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { toast } from 'sonner';
import { streamCompareContracts } from '@/lib/featuresApi';

export default function ContractCompare() {
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [comparison, setComparison] = useState<string>('');
  const [meta, setMeta] = useState<{ tokensUsed: number; modelUsed: string } | null>(null);

  const handleFileUpload = (file: File, type: 'primary' | 'comparison') => {
    if (type === 'primary') setPrimaryFile(file);
    else setComparisonFile(file);
  };

  const handleCompare = async () => {
    if (!primaryFile || !comparisonFile) return;
    setIsAnalyzing(true);
    setComparison('');
    setMeta(null);

    try {
      const primaryText = await extractTextFromFile(primaryFile);
      const comparisonText = await extractTextFromFile(comparisonFile);
      if (!primaryText || !comparisonText) {
        toast.error('Extraction failed', {
          description: 'Could not extract text from one or both documents. Use PDF, DOCX, or TXT.',
        });
        return;
      }

      const result = await streamCompareContracts(
        { contractA: primaryText, contractB: comparisonText },
        (delta) => setComparison((prev) => prev + delta)
      );
      setMeta({ tokensUsed: result.tokensUsed, modelUsed: result.modelUsed });
      toast.success('Comparison complete');
    } catch (error) {
      logError('Comparison error', error);
      toast.error('Comparison failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractTextFromFile = async (file: File): Promise<string | null> => {
    try {
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        return await file.text();
      }
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pageTexts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            pageTexts.push(
              textContent.items.map((item) => ('str' in item ? item.str : '') || '').join(' ')
            );
          }
          const extracted = pageTexts.join('\n\n');
          if (extracted.length > 10) return extracted;
        } catch (e) {
          logError('PDF extraction failed', e);
        }
      }
      if (file.name.toLowerCase().endsWith('.docx')) {
        try {
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          if (result.value && result.value.length > 10) return result.value;
        } catch (e) {
          logError('DOCX extraction failed', e);
        }
      }
      try {
        const reader = new FileReader();
        const rawText = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });
        if (rawText && rawText.length > 50 && !rawText.includes('\x00')) return rawText;
      } catch (e) {
        logError('Raw text fallback failed', e);
      }
      return null;
    } catch (error) {
      logError('Text extraction error', error);
      return null;
    }
  };

  const FileUploadZone = ({
    onFileUpload,
    file,
    label,
    type,
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
              Change file
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-medium">{label}</p>
            <p className="text-sm text-muted-foreground">PDF, DOCX, or TXT</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById(`file-${type}`)?.click()}
            >
              Choose file
            </Button>
          </div>
        )}
        <input
          id={`file-${type}`}
          type="file"
          accept=".txt,.doc,.docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileUpload(f);
          }}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-2xl font-semibold">Contract Comparison</h1>
        <p className="text-muted-foreground">
          Upload two contracts. The AI streams a side-by-side analysis of differences, risks, and
          key clauses as it writes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="font-medium">Primary document</h3>
          <FileUploadZone
            onFileUpload={(f) => handleFileUpload(f, 'primary')}
            file={primaryFile}
            label="Upload primary contract"
            type="primary"
          />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Comparison document</h3>
          <FileUploadZone
            onFileUpload={(f) => handleFileUpload(f, 'comparison')}
            file={comparisonFile}
            label="Upload new version"
            type="comparison"
          />
        </div>
      </div>

      <div className="flex justify-center gap-2">
        <Button
          onClick={handleCompare}
          disabled={!primaryFile || !comparisonFile || isAnalyzing}
          className="px-8"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Compare with AI
            </>
          )}
        </Button>
        {(comparison || isAnalyzing) && (
          <Button
            variant="outline"
            onClick={() => {
              setComparison('');
              setMeta(null);
              setPrimaryFile(null);
              setComparisonFile(null);
            }}
            disabled={isAnalyzing}
          >
            Reset
          </Button>
        )}
      </div>

      {(comparison || isAnalyzing) && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Comparison
              {isAnalyzing && (
                <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> streaming
                </span>
              )}
              {meta && !isAnalyzing && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {meta.modelUsed} · {meta.tokensUsed.toLocaleString()} tokens
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {comparison || (isAnalyzing ? '...' : '')}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
