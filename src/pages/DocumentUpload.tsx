import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { UploadCloud, Sparkles, Bot, Bell, ShieldCheck, FileText } from "lucide-react";
import { useCases } from "@/hooks/useCases";
import { useUploadDocument } from "@/hooks/useDocuments";
import { Case } from "@/types";

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Document name must be at least 2 characters.",
  }),
  content: z.string().optional(),
  summary: z.string().optional(),
  metadata: z.any().optional(),
  effective_date: z.string().optional(),
  renewal_date: z.string().optional(),
  termination_date: z.string().optional(),
  value: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Number(val)), {
      message: "Value must be a number",
    }),
  contract_type: z.string().optional(),
  currency: z.string().optional(),
  terms: z.string().optional(),
});

export default function DocumentUpload() {
  const navigate = useNavigate();
  const [selectedCase, setSelectedCase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Merged state from both branches
  const [isDragging, setIsDragging] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(false);
  const { toast } = useToast();
  // Assuming useUploadDocument returns a mutation object like useMutation
  const uploadDocument = useUploadDocument();

  const { data: casesData = { cases: [], count: 0 } } = useCases();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const watchName = watch("name");
  const watchSummary = watch("summary");

  const readinessSteps = useMemo(() => [
    { title: "Upload file", description: "Drop a contract, agreement, or supporting document.", completed: Boolean(file) },
    { title: "Add context", description: "Name the document and optionally tag a related case.", completed: Boolean(watchName) || Boolean(selectedCase) },
    { title: "Configure AI", description: "Choose if the AI should summarize and notify the team.", completed: autoSummarize || notifyTeam },
  ], [autoSummarize, file, notifyTeam, selectedCase, watchName]);

  const readinessProgress = useMemo(() => {
    const completed = readinessSteps.filter(step => step.completed).length;
    return Math.round((completed / readinessSteps.length) * 100);
  }, [readinessSteps]);

  const handleGenerateSummary = useCallback(() => {
    // This logic seems a bit redundant as autoSummarize is already true by default, 
    // but we'll keep it as it's part of the original logic in `main`.
    toast({
      title: autoSummarize ? "AI summary already enabled" : "AI summary requested",
      description: file ? "We'll include a generated summary when the upload completes." : "Add a document first so we know what to summarize.",
    });
    setAutoSummarize(true);
  }, [autoSummarize, file, toast]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a file to upload.",
      });
      return;
    }

    try {
      const numericValue = values.value ? Number(values.value) : undefined;

      // Use the logic from `codex` as it seems more complete for the document upload
      // and integrates all the fields from `formSchema`.
      await uploadDocument.mutateAsync({
        name: values.name,
        file,
        case_id: selectedCase || undefined,
        summary: values.summary?.trim() || undefined,
        contract_type: values.contract_type?.trim() || undefined,
        effective_date: values.effective_date || undefined,
        renewal_date: values.renewal_date || undefined,
        termination_date: values.termination_date || undefined,
        value: numericValue,
        currency: values.currency?.trim() || undefined,
        terms: values.terms?.trim() || undefined,
        metadata: {
          // Merge metadata logic from both branches for completeness
          ...(values.metadata ? { custom: values.metadata } : {}),
          ...(selectedCase ? { case_id: selectedCase } : {}),
          ai_preferences: { // Keep AI preferences from `main`
            autoSummarize,
            notifyTeam,
          },
          original_filename: file.name,
        },
      });

      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });

      navigate("/documents");
    } catch (error: unknown) {
      console.error("Error creating document:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create document.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        
        // Validate file before accepting
        try {
          const { validateFile } = await import('@/lib/fileValidation');
          const validation = validateFile(file);
          if (!validation.valid) {
            toast({
              variant: "destructive",
              title: "Invalid File",
              description: validation.error || 'File validation failed',
            });
            return;
          }
        } catch (error) {
          console.error('File validation error:', error);
          toast({
            variant: "destructive",
            title: "Validation Error",
            description: 'Failed to validate file',
          });
          return;
        }
        
        setFile(file);
        setIsDragging(false);
      }
    },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Upload Document</h1>
          <p className="text-muted-foreground">Upload a new document to the system</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card className="shadow-card">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-semibold">Document details</CardTitle>
            <CardDescription>Prepare a file, add the context our AI needs, and share it with your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Readiness Checklist (from main) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Upload readiness</p>
                  <h2 className="text-lg font-semibold">{readinessProgress === 100 ? "Ready to process" : "Complete these steps"}</h2>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">{readinessProgress}%</span>
                  <p className="text-xs text-muted-foreground">complete</p>
                </div>
              </div>
              <Progress value={readinessProgress} className="h-2" />
              <div className="grid gap-3 md:grid-cols-3">
                {readinessSteps.map(step => (
                  <div key={step.title} className={`rounded-lg border p-3 text-sm transition ${step.completed ? "border-primary bg-primary/5" : "border-dashed"}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{step.title}</p>
                      <Badge variant={step.completed ? "default" : "outline"} className="text-[10px] uppercase tracking-wide">
                        {step.completed ? "Done" : "Pending"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <Alert className="border-primary/40 bg-primary/5">
              <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Boost AI accuracy
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Include case links, contract values, and renewal expectations so summaries highlight the most relevant insights.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* File Upload (merged with isDragging class) */}
              <section className="space-y-3">
                <Label htmlFor="file">Document file</Label>
                <div {...getRootProps()} className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/60 p-6 text-center transition hover:border-primary hover:bg-primary/5 ${isDragging ? "border-primary bg-primary/10" : ""}`}>
                  <input {...getInputProps()} id="file" />
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UploadCloud className="h-6 w-6" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{file ? file.name : "Click or drag file to upload"}</p>
                    <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, TXT up to 10MB</p>
                    {file && (
                      <p className="text-xs text-muted-foreground/80 mt-1">
                        {(file.size / 1024).toFixed(1)} KB • {file.type || "Unknown type"}
                      </p>
                    )}
                  </div>
                  {file && <Button variant="ghost" size="sm" type="button" onClick={e => {
                    e.stopPropagation();
                    setFile(null);
                  }}>
                      Clear file
                    </Button>}
                </div>
              </section>

              {/* Document Name and Related Case (from main) */}
              <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Document name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Vendor agreement Q2"
                    type="text"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="case">Related case (optional)</Label>
                  <Select value={selectedCase} onValueChange={setSelectedCase}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a case..." />
                    </SelectTrigger>
                    <SelectContent>
                      {casesData.cases.map((case_: Case) => (
                        <SelectItem key={case_.id} value={case_.id}>
                          {case_.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>
              
              <Separator />

              {/* Dates & Financial Details (from codex) */}
              <section className="space-y-4">
                <p className="text-lg font-semibold">Contract & Financial Details (Optional)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">Effective Date</Label>
                    <Input type="date" id="effective_date" {...register("effective_date")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renewal_date">Renewal Date</Label>
                    <Input type="date" id="renewal_date" {...register("renewal_date")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termination_date">Termination Date</Label>
                    <Input type="date" id="termination_date" {...register("termination_date")} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="value">Contract Value</Label>
                    <div className="flex gap-2">
                      <Input
                        id="value"
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        {...register("value")}
                      />
                      <Input
                        id="currency"
                        placeholder="Currency"
                        className="max-w-[120px]"
                        {...register("currency")}
                      />
                    </div>
                    {errors.value && (
                      <p className="text-xs text-destructive">{errors.value.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">Document Type</Label>
                    <Input
                      id="contract_type"
                      placeholder="e.g. Master Service Agreement"
                      {...register("contract_type")}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Summary and Key Terms */}
              <section className="space-y-4">
                <p className="text-lg font-semibold">Context and Summary</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="summary">Summary (optional)</Label>
                    <Textarea
                      id="summary"
                      placeholder="Add any context or highlights you already know"
                      rows={4}
                      {...register("summary")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="terms">Key Terms (Optional)</Label>
                    <Textarea
                      id="terms"
                      placeholder="Notable clauses, parties, obligations..."
                      rows={4}
                      {...register("terms")}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* AI Workflow (from main) */}
              <section className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">AI workflow</p>
                    <p className="text-xs text-muted-foreground">Choose what should happen once the file is processed.</p>
                  </div>
                  <Badge variant={autoSummarize ? "default" : "secondary"} className="text-[10px] uppercase">{autoSummarize ? "AI enabled" : "Manual"}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-md border bg-background/80 p-3 text-sm">
                    <Checkbox checked={autoSummarize} onCheckedChange={value => setAutoSummarize(Boolean(value))} />
                    <span>
                      <span className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4 text-primary" />Generate AI summary</span>
                      <span className="text-xs text-muted-foreground">Receive a concise overview and key clauses within seconds.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border bg-background/80 p-3 text-sm">
                    <Checkbox checked={notifyTeam} onCheckedChange={value => setNotifyTeam(Boolean(value))} />
                    <span>
                      <span className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4 text-primary" />Notify legal team</span>
                      <span className="text-xs text-muted-foreground">Send a digest to collaborators when the AI finishes processing.</span>
                    </span>
                  </label>
                </div>
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleGenerateSummary}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Ask AI for a smarter summary
                </Button>
              </section>

              <CardFooter className="flex flex-col gap-2 p-0">
                <Button type="submit" className="w-full shadow-md" disabled={uploadDocument.isPending || !file}>
                  {uploadDocument.isPending ? "Uploading…" : "Upload document"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Files are encrypted at rest and automatically versioned.</p>
              </CardFooter>
            </form>
          </CardContent>
        </Card>

        {/* AI Preview and Checklist Sidebar (from main) */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI preview</CardTitle>
              <CardDescription>Review what will be shared once processing is complete.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Document name</p>
                <p className="font-medium text-foreground">{watchName || (file ? file.name : "Untitled document")}</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">AI summary</p>
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {watchSummary ? watchSummary : autoSummarize ? "We will generate a short executive summary and highlight the top risks once the upload finishes." : "Enable AI summarization to get quick talking points for your team."}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Workflow</p>
                <div className="flex flex-wrap gap-2">
                  {autoSummarize && <Badge variant="secondary" className="flex items-center gap-1 text-[10px] uppercase"><Bot className="h-3 w-3" /> Summary</Badge>}
                  {notifyTeam && <Badge variant="secondary" className="flex items-center gap-1 text-[10px] uppercase"><Bell className="h-3 w-3" /> Notify team</Badge>}
                  {selectedCase && <Badge variant="outline" className="flex items-center gap-1 text-[10px] uppercase"><FileText className="h-3 w-3" /> Linked case</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload checklist</CardTitle>
              <CardDescription>Confirm these best practices before sharing with clients.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                <span>Remove sensitive data or apply redactions if this file leaves your organization.</span>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-primary" />
                <span>Include renewal dates, contract values, and related matters so automated tracking stays accurate.</span>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                <span>Turn on AI summaries to help stakeholders review documents faster.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}