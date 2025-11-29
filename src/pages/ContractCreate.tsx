import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LucideIcon } from "lucide-react";
import { CalendarIcon, Plus, X, FileText, Users, Clock, Upload, Bot, Sparkles, ListChecks, Lightbulb, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useProfile } from "@/hooks/useProfile";
import { useOrganizationMembers } from "@/hooks/useOrganization";
import { useAIContractGenerator } from "@/hooks/useAIContractGenerator";
import { ContractSuccess } from "@/components/ContractSuccess";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
interface ContractParty {
  id: string;
  name: string;
  type: 'individual' | 'organization';
  email: string;
  address: string;
  role: string;
}
interface ContractClause {
  id: string;
  title: string;
  content: string;
  required: boolean;
}

type ContractTab = "basic" | "parties" | "terms" | "clauses" | "success";
type StepTab = Exclude<ContractTab, "success">;
export default function ContractCreate() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ContractTab>("basic");
  const generateContract = useAIContractGenerator();
  const [template, setTemplate] = useState<string>("");
  const [additionalTerms, setAdditionalTerms] = useState<string>("");
  const [generatedContract, setGeneratedContract] = useState<any>(null);
  const [contractData, setContractData] = useState({
    title: "",
    type: "",
    description: "",
    value: "",
    currency: "USD",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    status: "draft",
    assignedTo: ""
  });
  const {
    data: orgMembers = []
  } = useOrganizationMembers();
  const {
    data: profile
  } = useProfile();
  const [parties, setParties] = useState<ContractParty[]>([]);
  const [clauses, setClauses] = useState<ContractClause[]>([]);
  const [newParty, setNewParty] = useState<{
    name: string;
    type: 'individual' | 'organization';
    email: string;
    address: string;
    role: string;
  }>({
    name: "",
    type: "organization",
    email: "",
    address: "",
    role: ""
  });
  const [newClause, setNewClause] = useState({
    title: "",
    content: "",
    required: false
  });
  const contractTypes = ["Service Agreement", "Non-Disclosure Agreement", "Employment Contract", "Purchase Agreement", "Lease Agreement", "Partnership Agreement", "Licensing Agreement", "Consulting Agreement", "Supply Agreement", "Distribution Agreement"];
  const partyRoles = ["Client", "Contractor", "Vendor", "Partner", "Licensee", "Licensor", "Buyer", "Seller", "Tenant", "Landlord"];
  const standardClauses = [{
    title: "Confidentiality",
    content: "Both parties agree to maintain confidentiality of all proprietary information shared during the course of this agreement.",
    required: true
  }, {
    title: "Termination",
    content: "Either party may terminate this agreement with 30 days written notice to the other party.",
    required: true
  }, {
    title: "Governing Law",
    content: "This agreement shall be governed by and construed in accordance with the laws of [Jurisdiction].",
    required: true
  }, {
    title: "Force Majeure",
    content: "Neither party shall be liable for any failure to perform due to circumstances beyond their reasonable control.",
    required: false
  }, {
    title: "Intellectual Property",
    content: "All intellectual property created in connection with this agreement shall be owned by [Party Name].",
    required: false
  }];
  const addParty = () => {
    if (newParty.name && newParty.email && newParty.role) {
      const party: ContractParty = {
        id: `party-${Date.now()}`,
        ...newParty
      };
      setParties([...parties, party]);
      setNewParty({
        name: "",
        type: "organization",
        email: "",
        address: "",
        role: ""
      });
    }
  };
  const removeParty = (partyId: string) => {
    setParties(parties.filter(p => p.id !== partyId));
  };
  const addClause = () => {
    if (newClause.title && newClause.content) {
      const clause: ContractClause = {
        id: `clause-${Date.now()}`,
        ...newClause
      };
      setClauses([...clauses, clause]);
      setNewClause({
        title: "",
        content: "",
        required: false
      });
    }
  };
  const tabsOrder = useMemo<StepTab[]>(() => ["basic", "parties", "terms", "clauses"], []);
  const completionStatus = useMemo(() => ({
    basic: Boolean(contractData.title && contractData.type && contractData.description),
    parties: parties.length > 0,
    terms: Boolean(additionalTerms.trim() || template.trim() || contractData.startDate || contractData.endDate),
    clauses: clauses.length > 0,
  }), [
    contractData.description,
    contractData.endDate,
    contractData.startDate,
    contractData.title,
    contractData.type,
    parties.length,
    additionalTerms,
    template,
    clauses.length,
  ]);
  const completedCount = useMemo(() => Object.values(completionStatus).filter(Boolean).length, [completionStatus]);
  const progressValue = useMemo(() => {
    const baseProgress = (completedCount / tabsOrder.length) * 100;
    const currentIndex =
      activeTab === "success"
        ? tabsOrder.length - 1
        : tabsOrder.indexOf(activeTab as StepTab);
    if (currentIndex === -1) return baseProgress;
    const activeProgress = ((currentIndex + 1) / tabsOrder.length) * 100;
    return Math.max(baseProgress, activeProgress);
  }, [activeTab, completedCount, tabsOrder]);

  const stepDetails = useMemo<Record<StepTab, {
    title: string;
    description: string;
    icon: LucideIcon;
  }>>(() => ({
    basic: {
      title: "Basic Details",
      description: "Name the agreement and set its core metadata.",
      icon: FileText,
    },
    parties: {
      title: "Parties",
      description: "Identify everyone involved and their roles.",
      icon: Users,
    },
    terms: {
      title: "Terms & Timeline",
      description: "Capture milestones, value, and supporting context.",
      icon: Clock,
    },
    clauses: {
      title: "Clauses",
      description: "Fine tune obligations and key protections.",
      icon: ListChecks,
    },
  }), []);

  const handleUploadContract = useCallback(() => {
    navigate("/contracts/upload");
  }, [navigate]);
  const handleUseReamAI = useCallback(() => {
    navigate("/contracts/review");
  }, [navigate]);
  const nextActions = useMemo(() => [
    { title: "Upload existing contract", description: "Import a legacy agreement to compare or redline against the AI output.", icon: Upload, onClick: handleUploadContract },
    { title: "Use Ream AI reviewer", description: "Send a draft to Ream AI for compliance and risk checks before sharing.", icon: Sparkles, onClick: handleUseReamAI },
  ], [handleUploadContract, handleUseReamAI]);

  const clauseHighlights = useMemo(() => [
    {
      title: "Risk & compliance",
      description: "Add non-compete, liability, or privacy clauses to align with industry and local regulations.",
      icon: ShieldCheck,
    },
    {
      title: "AI drafting tips",
      description: "Reference governing law, deliverables, and review cycles so the AI can generate precise obligations.",
      icon: Lightbulb,
    },
  ], []);
  const addStandardClause = (standardClause: typeof standardClauses[0]) => {
    // Check if clause with the same title already exists
    const alreadyExists = clauses.some(c => c.title === standardClause.title);
    if (alreadyExists) {
      return; // Don't add duplicate
    }
    const clause: ContractClause = {
      id: `clause-${Date.now()}`,
      ...standardClause
    };
    setClauses([...clauses, clause]);
  };

  // Check if a standard clause is already added
  const isClauseAdded = (clauseTitle: string) => {
    return clauses.some(c => c.title === clauseTitle);
  };
  const removeClause = (clauseId: string) => {
    setClauses(clauses.filter(c => c.id !== clauseId));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractData.title || !contractData.type) {
      alert("Please fill in the required fields (Title and Type).");
      return;
    }
    try {
      const generationData = {
        basicInfo: {
          title: contractData.title,
          type: contractData.type,
          description: contractData.description,
          value: contractData.value,
          currency: contractData.currency,
          startDate: contractData.startDate?.toISOString().split('T')[0],
          endDate: contractData.endDate?.toISOString().split('T')[0]
        },
        parties,
        terms: additionalTerms,
        clauses,
        template: template || undefined
      };
      const result = await generateContract.mutateAsync(generationData);
      if (result.success) {
        setGeneratedContract(result.contract);
        setActiveTab("success");
      }
    } catch (error) {
      console.error("Contract generation failed:", error);
    }
  };

  // If we're showing success, render the success component
  if (activeTab === "success" && generatedContract) {
    return <div className="p-6">
        <Breadcrumbs />
        <ContractSuccess contract={generatedContract} onViewContract={() => navigate(`/contracts/${generatedContract.id}`)} />
      </div>;
  }
  return <div className="p-6 space-y-6">
      <Breadcrumbs />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Create New Contract</h1>
          <p className="text-muted-foreground">Generate a professional contract using AI with your custom details</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextActions.map(action => <Button key={action.title} variant="outline" onClick={action.onClick} className="flex items-center">
              <action.icon className="mr-2 h-4 w-4" />
              {action.title}
            </Button>)}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="shadow-card">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">AI readiness</p>
                  <h2 className="text-lg font-semibold">{completedCount === tabsOrder.length ? "Ready to generate" : "Complete each step to generate"}</h2>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">{Math.round(progressValue)}%</span>
                  <p className="text-xs text-muted-foreground">completion</p>
                </div>
              </div>
              <Progress value={progressValue} className="h-2" />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {tabsOrder.map(step => {
                const stepInfo = stepDetails[step];
                const Icon = stepInfo.icon;
                const stepIndex = tabsOrder.indexOf(step);
                const activeIndex =
                  activeTab === "success"
                    ? tabsOrder.length
                    : tabsOrder.indexOf(activeTab as StepTab);
                const isCompleted = completionStatus[step as keyof typeof completionStatus];
                const isActive = step === activeTab;
                const isPast = stepIndex < activeIndex;
                return <button key={step} type="button" onClick={() => setActiveTab(step)} className={`group rounded-xl border p-4 text-left transition hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isActive ? "border-primary bg-primary/5" : isCompleted || isPast ? "border-primary/40 bg-muted" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${isCompleted || isPast ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <Badge variant={isCompleted ? "default" : isActive ? "secondary" : "outline"}>{isCompleted ? "Done" : isActive ? "Active" : "Pending"}</Badge>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-semibold leading-none">{stepInfo.title}</p>
                      <p className="text-xs text-muted-foreground leading-snug">{stepInfo.description}</p>
                    </div>
                  </button>;
              })}
              </div>
            </div>

            <Alert className="border-primary/40 bg-primary/5">
              <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Tip for better drafts
              </AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                Share deliverables, payment cadence, and any approval checkpoints. Our AI blends this with your template to produce a tailored first draft.
              </AlertDescription>
            </Alert>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as ContractTab)}
              className="space-y-6"
            >
              <TabsList className="w-full justify-start gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-1">
                <TabsTrigger value="basic" className="flex items-center gap-2 whitespace-nowrap px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <FileText className="h-4 w-4" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger value="parties" className="flex items-center gap-2 whitespace-nowrap px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Users className="h-4 w-4" />
                  Parties
                </TabsTrigger>
                <TabsTrigger value="terms" className="flex items-center gap-2 whitespace-nowrap px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Clock className="h-4 w-4" />
                  Terms
                </TabsTrigger>
                <TabsTrigger value="clauses" className="flex items-center gap-2 whitespace-nowrap px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <ListChecks className="h-4 w-4" />
                  Clauses
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-6">
              <TabsContent value="basic" className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Contract Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="text-sm font-medium">
                        Contract Title <span className="text-destructive">*</span>
                      </Label>
                      <Input id="title" placeholder="e.g., Software Development Agreement" value={contractData.title} onChange={e => setContractData({
                      ...contractData,
                      title: e.target.value
                    })} required className="h-11" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Contract Type <span className="text-destructive">*</span>
                      </Label>
                      <Select value={contractData.type} onValueChange={value => setContractData({
                      ...contractData,
                      type: value
                    })}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select contract type" />
                        </SelectTrigger>
                        <SelectContent>
                          {contractTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 mt-6">
                    <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                    <Textarea id="description" placeholder="Brief description of the contract purpose and scope..." value={contractData.description} onChange={e => setContractData({
                    ...contractData,
                    description: e.target.value
                  })} rows={3} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="space-y-2">
                      <Label htmlFor="value" className="text-sm font-medium">Contract Value</Label>
                      <Input id="value" type="number" placeholder="0.00" value={contractData.value} onChange={e => setContractData({
                      ...contractData,
                      value: e.target.value
                    })} className="h-11" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Currency</Label>
                      <Select value={contractData.currency} onValueChange={value => setContractData({
                      ...contractData,
                      currency: value
                    })}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="py-[10px]">
                          <SelectItem value="USD" className="py-[10px]">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="CAD">CAD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Assigned To</Label>
                      <Select value={contractData.assignedTo} onValueChange={value => setContractData({
                      ...contractData,
                      assignedTo: value
                    })}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          {profile && <SelectItem value={profile.user_id}>
                              Me ({profile.first_name || ''} {profile.last_name || ''})
                            </SelectItem>}
                          {orgMembers.filter(({
                          user_id
                        }) => !profile || user_id !== profile.user_id).map(user => <SelectItem key={user.user_id} value={user.user_id}>
                                {user.first_name} {user.last_name} ({user.email})
                              </SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="parties" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Contract Parties</h3>
                  
                  {parties.length > 0 && <div className="space-y-3">
                      {parties.map(party => <Card key={party.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{party.name}</h4>
                                  <Badge variant="outline">
                                    {party.type}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {party.role}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{party.email}</p>
                                {party.address && <p className="text-sm text-muted-foreground">{party.address}</p>}
                              </div>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeParty(party.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>)}
                    </div>}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Add New Party</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="partyName">Name *</Label>
                          <Input id="partyName" placeholder="Party name" value={newParty.name} onChange={e => setNewParty({
                          ...newParty,
                          name: e.target.value
                        })} />
                        </div>

                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={newParty.type} onValueChange={value => setNewParty({
                          ...newParty,
                          type: value as 'individual' | 'organization'
                        })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="organization">Organization</SelectItem>
                              <SelectItem value="individual">Individual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="partyEmail">Email *</Label>
                          <Input id="partyEmail" type="email" placeholder="contact@example.com" value={newParty.email} onChange={e => setNewParty({
                          ...newParty,
                          email: e.target.value
                        })} />
                        </div>

                        <div className="space-y-2">
                          <Label>Role *</Label>
                          <Select value={newParty.role} onValueChange={value => setNewParty({
                          ...newParty,
                          role: value
                        })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {partyRoles.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="partyAddress">Address</Label>
                        <Textarea id="partyAddress" placeholder="Full address" value={newParty.address} onChange={e => setNewParty({
                        ...newParty,
                        address: e.target.value
                      })} />
                      </div>

                        <Button type="button" onClick={addParty}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Party
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="terms" className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="additionalTerms">Additional Terms & Conditions</Label>
                    <Textarea id="additionalTerms" placeholder="Enter any specific terms, conditions, or requirements for this contract..." value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)} rows={6} />
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Reference Material</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="template">Contract Template (Optional)</Label>
                        <Textarea id="template" placeholder="Paste an existing contract template here for the AI to use as a reference..." value={template} onChange={e => setTemplate(e.target.value)} rows={6} />
                        <p className="text-xs text-muted-foreground">
                          Upload or paste a contract template to help the AI generate a contract that follows your preferred structure and style.
                        </p>
                      </div>
                      <Separator />
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {contractData.startDate ? format(contractData.startDate, "PPP") : "Select start date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={contractData.startDate} onSelect={date => setContractData({
                              ...contractData,
                              startDate: date
                            })} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {contractData.endDate ? format(contractData.endDate, "PPP") : "Select end date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={contractData.endDate} onSelect={date => setContractData({
                              ...contractData,
                              endDate: date
                            })} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">AI Suggestions</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      {clauseHighlights.map(({ title, description, icon: Icon }, index) => <div key={index} className="rounded-lg border bg-muted/40 p-3 text-sm">
                          <div className="mb-2 flex items-center gap-2 font-medium">
                            <Icon className="h-4 w-4 text-primary" />
                            {title}
                          </div>
                          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
                        </div>)}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="clauses" className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Contract Clauses</h3>
                    <div className="text-sm text-muted-foreground">
                      {clauses.filter(c => c.required).length} required, {clauses.filter(c => !c.required).length} optional
                    </div>
                  </div>

                  {clauses.length > 0 && <div className="space-y-3">
                      {clauses.map(clause => <Card key={clause.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{clause.title}</h4>
                                  <Badge variant={clause.required ? "default" : "secondary"}>
                                    {clause.required ? "Required" : "Optional"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{clause.content}</p>
                              </div>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeClause(clause.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>)}
                    </div>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Add Custom Clause</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="clauseTitle">Clause Title</Label>
                          <Input id="clauseTitle" placeholder="Enter clause title" value={newClause.title} onChange={e => setNewClause({
                          ...newClause,
                          title: e.target.value
                        })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="clauseContent">Clause Content</Label>
                          <Textarea id="clauseContent" placeholder="Enter clause content" value={newClause.content} onChange={e => setNewClause({
                          ...newClause,
                          content: e.target.value
                        })} />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox id="clauseRequired" checked={newClause.required} onCheckedChange={checked => setNewClause({
                          ...newClause,
                          required: Boolean(checked)
                        })} />
                          <Label htmlFor="clauseRequired">Required clause</Label>
                        </div>

                        <Button type="button" onClick={addClause}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Clause
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Standard Clauses</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {standardClauses.map((clause, index) => {
                          const alreadyAdded = isClauseAdded(clause.title);
                          return (
                            <div key={index} className={`p-3 border rounded-lg ${alreadyAdded ? 'opacity-60 bg-muted/50' : ''}`}>
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium">{clause.title}</h5>
                                <Badge variant={alreadyAdded ? "outline" : clause.required ? "default" : "secondary"} className="text-xs">
                                  {alreadyAdded ? "Added" : clause.required ? "Required" : "Optional"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">
                                {clause.content.substring(0, 100)}...
                              </p>
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={() => addStandardClause(clause)}
                                disabled={alreadyAdded}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                {alreadyAdded ? "Added" : "Add"}
                              </Button>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <div className="flex justify-between pt-6 border-t">
                <Button type="button" variant="outline">
                  Save as Draft
                </Button>
                <div className="flex gap-2">
                  {activeTab !== "basic" && <Button type="button" variant="outline" onClick={() => {
                  if (activeTab === "success") {
                    return;
                  }
                  const tabs: StepTab[] = ["basic", "parties", "terms", "clauses"];
                  const currentIndex = tabs.indexOf(activeTab);
                  if (currentIndex > 0) {
                    setActiveTab(tabs[currentIndex - 1]);
                  }
                }}>
                      Previous
                    </Button>}
                  {activeTab !== "clauses" ? <Button type="button" onClick={() => {
                  if (activeTab === "success") {
                    return;
                  }
                  const tabs: StepTab[] = ["basic", "parties", "terms", "clauses"];
                  const currentIndex = tabs.indexOf(activeTab);
                  if (currentIndex < tabs.length - 1) {
                    setActiveTab(tabs[currentIndex + 1]);
                  }
                }}>
                      Next
                    </Button> : <Button type="submit" disabled={generateContract.isPending} className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 h-11 px-8">
                       {generateContract.isPending ? <>
                           <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                           Generating Contract...
                         </> : <>
                           <Bot className="h-4 w-4 mr-2" />
                           Generate Contract with AI
                         </>}
                     </Button>}
                </div>
              </div>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contract overview</CardTitle>
              <CardDescription>Your selections update in real time to preview what the AI will draft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Title</p>
                <p className="font-medium text-foreground">{contractData.title || "Untitled contract"}</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{contractData.type || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Assigned To</p>
                  <p className="font-medium">{contractData.assignedTo ? orgMembers.find(({ user_id }) => user_id === contractData.assignedTo)?.first_name || "Team member" : "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Value</p>
                  <p className="font-medium">{contractData.value ? `${contractData.currency} ${contractData.value}` : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">{contractData.startDate && contractData.endDate ? `${format(contractData.startDate, "PP")} → ${format(contractData.endDate, "PP")}` : "Not scheduled"}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Parties</p>
                {parties.length > 0 ? parties.map(party => <div key={party.id} className="flex items-start justify-between rounded-lg bg-muted/40 p-2">
                      <div>
                        <p className="text-sm font-medium">{party.name}</p>
                        <p className="text-xs text-muted-foreground">{party.role}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase">{party.type}</Badge>
                    </div>) : <p className="text-xs text-muted-foreground">No parties added yet.</p>}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Clauses</p>
                <p className="text-xs text-muted-foreground">{clauses.length} configured ({clauses.filter(c => c.required).length} required)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Next best actions</CardTitle>
              <CardDescription>Keep your workflow moving without leaving this screen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {nextActions.map(action => <button key={action.title} onClick={action.onClick} className="flex w-full items-start gap-3 rounded-lg border border-dashed p-3 text-left transition hover:border-primary/50 hover:bg-primary/5">
                  <span className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                    <action.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </button>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>;
}
