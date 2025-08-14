import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from 'uuid';
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
import { useCreateDocument } from "@/hooks/useDocuments";

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
  value: z.number().optional(),
  contract_type: z.string().optional(),
  currency: z.string().optional(),
  terms: z.string().optional(),
});

export default function DocumentUpload() {
  const navigate = useNavigate();
  const [selectedCase, setSelectedCase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const createDocument = useCreateDocument();

  const { data: casesData } = useCases();
  const cases = casesData?.cases || []; // Extract cases from the data structure

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

    const fileId = uuidv4();
    const fileName = `${fileId}-${file.name}`;

    try {
      // Upload the file to Supabase storage (replace with your actual storage upload logic)
      // const { data, error } = await supabase.storage
      //   .from('documents')
      //   .upload(fileName, file);

      // if (error) {
      //   console.error("Error uploading file:", error);
      //   toast({
      //     variant: "destructive",
      //     title: "Error",
      //     description: "Failed to upload file to storage.",
      //   });
      //   return;
      // }

      // Create the document in the database
      await createDocument.mutateAsync({
        ...values,
        name: file.name, // Use the original file name
        content: fileName, // Store the file name in the content field
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
    onDrop: (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    },
    multiple: false,
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

      {/* Upload Form */}
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
              <div {...getRootProps()} className="relative border rounded-md p-4 flex items-center justify-center bg-muted hover:bg-accent cursor-pointer">
                <input {...getInputProps()} id="file" />
                <UploadCloud className="h-6 w-6 mr-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : "Click or drag file to upload"}
                </span>
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

            {/* Related Case */}
            <div className="space-y-2">
              <Label htmlFor="case">Related Case (Optional)</Label>
              <Select value={selectedCase} onValueChange={setSelectedCase}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a case..." />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((case_: any) => (
                    <SelectItem key={case_.id} value={case_.id}>
                      {case_.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Submit Button */}
            <Button type="submit" className="shadow-md w-full">
              Upload Document
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
