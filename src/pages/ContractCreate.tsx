import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Plus, X, FileText, Users, Clock, Upload, Bot, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useProfile } from "@/hooks/useProfile";
import { useOrganizationMembers } from "@/hooks/useOrganization";
import { useAIContractGenerator } from "@/hooks/useAIContractGenerator";
import { ContractSuccess } from "@/components/ContractSuccess";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
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
export default function ContractCreate() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("basic");
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
  const addStandardClause = (standardClause: typeof standardClauses[0]) => {
    const clause: ContractClause = {
      id: `clause-${Date.now()}`,
      ...standardClause
    };
    setClauses([...clauses, clause]);
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
  const handleUploadContract = () => {
    navigate("/contracts/upload");
  };
  const handleUseReamAI = () => {
    navigate("/contracts/review");
  };
  return <div className="p-6 space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Create New Contract</h1>
          <p className="text-muted-foreground">Generate a professional contract using AI with your custom details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleUploadContract}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Contract
          </Button>
          <Button variant="secondary" onClick={handleUseReamAI}>
            <Sparkles className="h-4 w-4 mr-2" />
            Use Ream AI
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 bg-muted/50">
              <TabsTrigger value="basic" className="flex items-center gap-2 data-[state=active]:bg-background">
                <FileText className="h-4 w-4" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="parties" className="flex items-center gap-2 data-[state=active]:bg-background">
                <Users className="h-4 w-4" />
                Parties
              </TabsTrigger>
              <TabsTrigger value="terms" className="flex items-center gap-2 data-[state=active]:bg-background">
                <Clock className="h-4 w-4" />
                Terms
              </TabsTrigger>
              <TabsTrigger value="clauses" className="flex items-center gap-2 data-[state=active]:bg-background">
                <FileText className="h-4 w-4" />
                Clauses
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit}>
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

              <TabsContent value="terms" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="additionalTerms">Additional Terms & Conditions</Label>
                    <Textarea id="additionalTerms" placeholder="Enter any specific terms, conditions, or requirements for this contract..." value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)} rows={6} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template">Contract Template (Optional)</Label>
                    <Textarea id="template" placeholder="Paste an existing contract template here for the AI to use as a reference..." value={template} onChange={e => setTemplate(e.target.value)} rows={8} />
                    <p className="text-sm text-muted-foreground">
                      Upload or paste a contract template to help the AI generate a contract that follows your preferred structure and style.
                    </p>
                  </div>
                
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <input type="checkbox" id="clauseRequired" checked={newClause.required} onChange={e => setNewClause({
                          ...newClause,
                          required: e.target.checked
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
                        {standardClauses.map((clause, index) => <div key={index} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium">{clause.title}</h5>
                              <Badge variant={clause.required ? "default" : "secondary"} className="text-xs">
                                {clause.required ? "Required" : "Optional"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              {clause.content.substring(0, 100)}...
                            </p>
                            <Button type="button" variant="outline" size="sm" onClick={() => addStandardClause(clause)}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>)}
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
                  const tabs = ["basic", "parties", "terms", "clauses"];
                  const currentIndex = tabs.indexOf(activeTab);
                  if (currentIndex > 0) {
                    setActiveTab(tabs[currentIndex - 1]);
                  }
                }}>
                      Previous
                    </Button>}
                  {activeTab !== "clauses" ? <Button type="button" onClick={() => {
                  const tabs = ["basic", "parties", "terms", "clauses"];
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
    </div>;
}