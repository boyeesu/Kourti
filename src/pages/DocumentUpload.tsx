import { useState } from "react";
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
} from "@/components/ui/card";
import { UploadCloud } from "lucide-react";
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
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const uploadDocument = useUploadDocument();

  const { data: casesData = { cases: [], count: 0 } } = useCases();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

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
          ...(values.metadata ? { custom: values.metadata } : {}),
          ...(selectedCase ? { case_id: selectedCase } : {}),
        },
      });

      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });

      navigate("/documents");
    } catch (error: any) {
      console.error("Error creating document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create document.",
      });
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        setIsDragging(false);
      }
    },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Upload Document</h1>
          <p className="text-muted-foreground">Upload a new document to the system</p>
        </div>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Document Details</CardTitle>
          <CardDescription>
            Fill in the details about the document you are uploading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file">
                Document File
              </Label>
              <div
                {...getRootProps()}
                className={`relative border rounded-md p-4 flex flex-col items-center justify-center gap-2 bg-muted hover:bg-accent cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/10" : ""}`}
              >
                <input {...getInputProps()} id="file" />
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    {file ? file.name : "Click or drag file to upload"}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Supported formats: PDF, DOCX, TXT, images
                  </p>
                  {file && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB • {file.type || "Unknown type"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Document Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Document Name</Label>
              <Input
                id="name"
                placeholder="Enter document name"
                type="text"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-2">
              <Label htmlFor="summary">Summary (Optional)</Label>
              <Textarea
                id="summary"
                placeholder="Enter a brief summary of the document"
                {...register("summary")}
              />
            </div>

            {/* Dates & Financial Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="effective_date">Effective Date</Label>
                <Input type="date" id="effective_date" {...register("effective_date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="termination_date">Termination Date</Label>
                <Input type="date" id="termination_date" {...register("termination_date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal_date">Renewal Date</Label>
                <Input type="date" id="renewal_date" {...register("renewal_date")} />
              </div>
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
            </div>

            {/* Contract metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract_type">Document Type</Label>
                <Input
                  id="contract_type"
                  placeholder="e.g. Master Service Agreement"
                  {...register("contract_type")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms">Key Terms (Optional)</Label>
                <Textarea
                  id="terms"
                  placeholder="Notable clauses, parties, obligations..."
                  {...register("terms")}
                />
              </div>
            </div>

            {/* Related Case */}
            <div className="space-y-2">
              <Label htmlFor="case">Related Case (Optional)</Label>
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

            {/* Submit Button */}
            <Button type="submit" className="shadow-md w-full" disabled={uploadDocument.isPending}>
              {uploadDocument.isPending ? "Uploading…" : "Upload Document"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
