import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCase, type CreateCaseData } from "@/hooks/useCases";
import { useClients } from "@/hooks/useClients";
import { useCaseTypes } from "@/features/cases/api/useCaseTypes";
import { useCaseIssues } from "@/features/cases/api/useCaseIssues";
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { useCaseFields } from "@/features/cases/api/useCaseFields";
import { CaseTypeSelector } from "@/features/cases/components/CaseTypeSelector";
import { CaseType } from "@/features/cases/types";
import { DynamicForm, DynamicField } from "@/shared/components/DynamicForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

const caseSchema = z.object({
  title: z.string().min(1, "Matter title is required"),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
  description: z.string().optional(),
  case_number: z.string().optional(),
  client_id: z.string().optional(),
  court: z.string().optional(),
  next_hearing_date: z.date().optional(),
  case_type_id: z.string().optional(),
  case_issue_id: z.string().optional(),
});

type CaseFormData = z.infer<typeof caseSchema>;

export default function CaseCreate() {
  const navigate = useNavigate();
  const { data } = useClients();
  const clients = data?.items ?? [];
  const createCase = useCreateCase();
  const { createCaseNotification } = useNotificationTriggers();

  // hooks for case types, issues & fields
  useCaseTypes(); // Load case types for selector
  const [caseTypeId, setCaseTypeId] = useState<string>("");
  const { data: caseIssues = [], isLoading: isLoadingCaseIssues } = useCaseIssues(caseTypeId);
  const [caseIssueId, setCaseIssueId] = useState<string>("");
  const { data: caseFields = [] } = useCaseFields(caseTypeId);
  const [dynamicValues, setDynamicValues] = useState<Record<string, unknown>>({});
  
  // Remember last used matter type
  const lastMatterType = typeof window !== 'undefined' 
    ? localStorage.getItem('last_matter_type') 
    : '';

  const form = useForm<CaseFormData>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "open",
      priority: "medium",
      client_id: "",
      court: "",
      case_type_id: lastMatterType || "",
      case_issue_id: "",
    },
  });

  // Save matter type to localStorage when changed
  useEffect(() => {
    if (caseTypeId && typeof window !== 'undefined') {
      localStorage.setItem('last_matter_type', caseTypeId);
    }
  }, [caseTypeId]);

  // Reset issue when type changes
  useEffect(() => {
    setCaseIssueId("");
    form.setValue("case_issue_id", "");
  }, [caseTypeId, form]);

  const onSubmit = async (data: CaseFormData) => {
    try {
      // Validate required fields
      if (!caseTypeId) {
        form.setError("case_type_id", { message: "Matter type is required" });
        return;
      }

      const caseData = {
        title: data.title,
        description: data.description || "",
        case_number: data.case_number,
        status: data.status || "open",
        priority: data.priority || "medium",
        client_id: data.client_id || null,
        court: data.court,
        next_hearing_date: data.next_hearing_date?.toISOString() || null,
        case_type_id: caseTypeId,
        case_issue_id: caseIssueId || null,
        custom_fields: dynamicValues,
      } as CreateCaseData;

      const newCase = await createCase.mutateAsync(caseData);
      
      // Create notification for matter creation
      await createCaseNotification(newCase, 'created');
      
      navigate(`/matters/${newCase.id}`);
    } catch {
      /* error handled by mutation */
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/matters")}> <ArrowLeft className="h-4 w-4" /> </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create New Matter</h1>
          <p className="text-muted-foreground">Add a new matter to your organization</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Matter Details</CardTitle></CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Static fields */}
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter Title *</FormLabel>
                    <FormControl><Input placeholder="Enter matter title" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="case_number" render={({ field }) => (
                  <FormItem><FormLabel>Matter Number</FormLabel><FormControl><Input placeholder="Auto-generated if empty" {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <FormField control={form.control} name="client_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

              </div>

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Enter matter description" className="min-h-[100px]" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Matter Type and Issue selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="case_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        Matter Type <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <CaseTypeSelector
                          value={caseTypeId}
                          onValueChange={(value) => {
                            setCaseTypeId(value);
                            field.onChange(value);
                            
                            // Reset case issue when case type changes
                            setCaseIssueId("");
                            form.setValue("case_issue_id", "");
                          }}
                          required
                          renderItem={(caseType: CaseType) => (
                            <>
                              {caseType.name}
                              {caseType.description && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  {caseType.description}
                                </span>
                              )}
                            </>
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {caseTypeId && (
                  <FormField
                    control={form.control}
                    name="case_issue_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Matter Issue *</FormLabel>
                        <FormControl>
                          <Select 
                            value={caseIssueId} 
                            onValueChange={(value) => {
                              setCaseIssueId(value);
                              field.onChange(value);
                            }}
                            disabled={!caseTypeId || isLoadingCaseIssues}
                            required
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingCaseIssues ? "Loading issues..." : "Select matter issue"} />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingCaseIssues ? (
                                <SelectItem value="loading" disabled>Loading issues...</SelectItem>
                              ) : caseIssues.length > 0 ? (
                                caseIssues.map(issue => (
                                   <SelectItem key={issue.id} value={issue.id}>{issue.name}</SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>No issues available for this matter type</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Dynamic Custom Fields */}
              {caseTypeId && caseFields.length > 0 && (
                <DynamicForm 
                  fields={caseFields.map(field => ({
                    ...field,
                    required: field.is_required ?? false
                  })) as DynamicField[]} 
                  initialValues={{}} 
                  onSubmit={setDynamicValues} 
                  hideSubmit 
                />
              )}

              {/* Optional Fields Section */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-medium mb-4 text-foreground">Optional Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="court" render={({ field }) => (
                    <FormItem><FormLabel>Court</FormLabel><FormControl><Input placeholder="Enter court name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField control={form.control} name="next_hearing_date" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Next Hearing Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} <CalendarIcon className="ml-auto h-4 w-4 opacity-50" /> </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={d => d < new Date()} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => navigate("/matters")}>Cancel</Button>
                <Button type="submit" disabled={createCase.isPending}>{createCase.isPending ? "Creating..." : "Create Matter"}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}