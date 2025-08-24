import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCase } from "@/hooks/useCases";
import { useClients } from "@/hooks/useClients";
import { useCaseTypes } from "@/features/cases/api/useCaseTypes";
import { useCaseIssues } from "@/features/cases/api/useCaseIssues";
import { useCreateNotification } from "@/hooks/useNotifications";
import { useCaseFields } from "@/features/cases/api/useCaseFields";
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
  title: z.string().min(1, "Case title is required"),
  description: z.string().optional(),
  case_number: z.string().optional(),
  status: z.string().default("open"),
  priority: z.string().default("medium"),
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
  const createNotification = useCreateNotification();

  // hooks for case types, issues & fields
  const { data: caseTypes = [], isLoading: isLoadingCaseTypes, error: caseTypesError } = useCaseTypes();
  const [caseTypeId, setCaseTypeId] = useState<string>("");
  const { data: caseIssues = [], isLoading: isLoadingCaseIssues } = useCaseIssues(caseTypeId);
  const [caseIssueId, setCaseIssueId] = useState<string>("");
  const { data: caseFields = [] } = useCaseFields(caseTypeId);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  
  // Log current state for debugging
  useEffect(() => {
    console.log('Case types loaded:', caseTypes);
    console.log('Selected case type ID:', caseTypeId);
    console.log('Case issues loaded:', caseIssues);
    console.log('Selected case issue ID:', caseIssueId);
  }, [caseTypes, caseTypeId, caseIssues, caseIssueId]);
  
  const form = useForm<CaseFormData>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "open",
      priority: "medium",
      client_id: "",
      court: "",
      case_type_id: "",
      case_issue_id: "",
    },
  });

  // Reset issue when type changes
  useEffect(() => {
    setCaseIssueId("");
    form.setValue("case_issue_id", "");
  }, [caseTypeId, form]);

  const onSubmit = async (data: CaseFormData) => {
    try {
      const caseData = {
        title: data.title,
        description: data.description,
        case_number: data.case_number,
        status: data.status,
        priority: data.priority,
        client_id: data.client_id,
        court: data.court,
        next_hearing_date: data.next_hearing_date?.toISOString(),
        case_type_id: caseTypeId,
        case_issue_id: caseIssueId,
        custom_fields: dynamicValues,
      } as any;

      const newCase = await createCase.mutateAsync(caseData);
      
      // Create notification for case creation
      await createNotification.mutateAsync({
        title: "New Case Created",
        description: `Case "${data.title}" has been created successfully.`,
        type: "case",
      });
      
      navigate(`/cases/${newCase.id}`);
    } catch {
      /* error handled by mutation */
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}> <ArrowLeft className="h-4 w-4" /> </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create New Case</h1>
          <p className="text-muted-foreground">Add a new case to your organization</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Case Details</CardTitle></CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Static fields */}
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case Title *</FormLabel>
                    <FormControl><Input placeholder="Enter case title" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="case_number" render={({ field }) => (
                  <FormItem><FormLabel>Case Number</FormLabel><FormControl><Input placeholder="Auto-generated if empty" {...field} /></FormControl><FormMessage /></FormItem>
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

                <FormField control={form.control} name="court" render={({ field }) => (
                  <FormItem><FormLabel>Court</FormLabel><FormControl><Input placeholder="Enter court name" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              {/* Hearing date */}
              <FormField control={form.control} name="next_hearing_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Next Hearing Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("w-[240px] pl-3 text-left font-normal", !field.value && "text-muted-foreground")}> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} <CalendarIcon className="ml-auto h-4 w-4 opacity-50" /> </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={d => d < new Date()} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Enter case description" className="min-h-[100px]" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Case Type and Issue selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="case_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Case Type *</FormLabel>
                      <FormControl>
                        <Select 
                          value={caseTypeId} 
                          onValueChange={(value) => {
                            console.log('Case type selected:', value);
                            setCaseTypeId(value);
                            field.onChange(value);
                          }}
                          required
                          disabled={isLoadingCaseTypes}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingCaseTypes ? "Loading case types..." : "Select case type"} />
                          </SelectTrigger>
                          <SelectContent>
                            {isLoadingCaseTypes ? (
                              <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : caseTypes.length > 0 ? (
                              caseTypes.map(ct => <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>)
                            ) : (
                              <SelectItem value="none" disabled>No case types available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {caseTypesError && (
                        <p className="text-sm text-red-500">Error loading case types</p>
                      )}
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
                        <FormLabel>Case Issue *</FormLabel>
                        <FormControl>
                          <Select 
                            value={caseIssueId} 
                            onValueChange={(value) => {
                              console.log('Case issue selected:', value);
                              setCaseIssueId(value);
                              field.onChange(value);
                            }}
                            disabled={!caseTypeId || isLoadingCaseIssues}
                            required
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingCaseIssues ? "Loading issues..." : "Select case issue"} />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingCaseIssues ? (
                                <SelectItem value="loading" disabled>Loading issues...</SelectItem>
                              ) : caseIssues.length > 0 ? (
                                caseIssues.map(issue => (
                                  <SelectItem key={issue.id} value={issue.id}>{issue.name}</SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>No issues available for this case type</SelectItem>
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
                <DynamicForm fields={caseFields as DynamicField[]} initialValues={{}} onSubmit={setDynamicValues} hideSubmit />
              )}

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => navigate("/cases")}>Cancel</Button>
                <Button type="submit" disabled={createCase.isPending}>{createCase.isPending ? "Creating..." : "Create Case"}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}