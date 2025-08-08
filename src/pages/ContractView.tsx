 // --- AI Review Dialog Component ---
function AIReviewDialog({ contractText }: { contractText: string }) {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<null | {
    summary: string;
    clauses: string;
    redlines: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReview() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      // combine the user's context into the review process by adding it to the prompts
      const fullText = context.trim()
        ? `${contractText}\n\nUser Instructions/Context: ${context}`
        : contractText;
      const [summary, clauses, redlines] = await Promise.all([
        summarizeContract(fullText),
        extractKeyClauses(fullText),
        redlineContract(fullText),
      ]);
      setResults({ summary, clauses, redlines });
    } catch (e) {
      setError("There was an error with the AI review. Please try again or check your API key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>AI Review for Contract</DialogTitle>
        <DialogDescription>
          The AI will read, summarize, identify key clauses, and redline critical issues/risk areas in this contract.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <label className="font-medium text-sm">Review Context (optional)</label>
        <Textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="e.g. Focus on indemnity and limitation of liability. Flag missing non-compete or dubious payment schedule terms."
          rows={3}
        />
        <div className="text-xs text-muted-foreground">
          Tips: Be specific if you want the AI to pay attention to something ("Summarize for a junior associate." "Highlight jurisdictional risk." "Is there a change of control clause?")
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleReview} disabled={loading} className="w-full">
          {loading ? "Running AI Review..." : "Run Review"}
        </Button>
      </DialogFooter>
      <div className="py-2">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {results && (
          <div className="space-y-4 mt-2">
            <div>
              <h4 className="font-semibold mb-1">Summary</h4>
              <div className="bg-muted/60 border rounded p-2 text-sm whitespace-pre-wrap">{results.summary}</div>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Key Clauses Extracted</h4>
              <div className="bg-muted/60 border rounded p-2 text-sm whitespace-pre-wrap">{results.clauses}</div>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Redlines & Review Comments</h4>
              <div className="bg-muted/60 border rounded p-2 text-sm whitespace-pre-wrap">{results.redlines}</div>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}
import { Link } from "react-router-dom";
import { useState } from "react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { contractsData } from "./contractsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  Edit,
  GitBranch,
  FileText,
  Calendar,
  User,
  Building,
  DollarSign,
  Clock,
  Eye,
  Share,
  ArrowLeft,
  Sparkles
} from "lucide-react";
import { summarizeContract, extractKeyClauses, redlineContract } from "@/lib/openaiService";

function AppLayout(props) {
  // ... using children somewhere ...
}

export default function ContractView() {
  const { id } = useParams();
  const contract = contractsData.find((c) => c.id === id);

  // Enhanced contract data with more details
  const contractDetails = {
    ...contract,
    status: "Active",
    type: "Software License Agreement",
    parties: [
      { name: "Acme Corp", role: "Licensor", type: "Organization" },
      { name: "Client Company", role: "Licensee", type: "Organization" }
    ],
    value: "$50,000",
    currency: "USD",
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    assignedTo: "Sarah Wilson",
    createdBy: "Michael Chen",
    createdAt: "2023-12-01",
    lastModified: "2024-02-01",
    tags: ["Software", "License", "Commercial"],
    approvalStatus: "Approved",
    signatureStatus: "Fully Executed"
  };

  if (!contract) {
    return (
      <div className="p-6">
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Contract Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The contract you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contracts
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDownload = () => {
    const blob = new Blob([contract.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contract.name}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{contract.name}</h1>
            <Badge variant="outline" className={getStatusColor(contractDetails.status)}>
              {contractDetails.status}
            </Badge>
            <Badge variant="secondary">{contract.id}</Badge>
          </div>
          <p className="text-muted-foreground">{contractDetails.type}</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/contracts/${contract.id}/history`}>
              <GitBranch className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/contracts/${contract.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="terms">Terms & Conditions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contract Summary */}
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader>
                <CardTitle>Contract Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Contract Value</p>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.value} {contractDetails.currency}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.startDate}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.endDate}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.assignedTo}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created By</p>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.createdBy}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Modified</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{contractDetails.lastModified}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {contractDetails.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status & Approvals */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Status & Approvals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Contract Status</p>
                  <Badge className={getStatusColor(contractDetails.status)}>
                    {contractDetails.status}
                  </Badge>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Approval Status</p>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    {contractDetails.approvalStatus}
                  </Badge>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Signature Status</p>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    {contractDetails.signatureStatus}
                  </Badge>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Recent Activity</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Contract signed by all parties</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Final review completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span>Terms updated in v2</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="document" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contract Document</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  Read-only view
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="default" className="ml-4 flex gap-1 items-center">
                        <Sparkles className="h-4 w-4" /> AI Review
                      </Button>
                    </DialogTrigger>
                    <AIReviewDialog contractText={contract.content} />
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/30 p-6 rounded-lg border">
                  {contract.content}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parties" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Contract Parties</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contractDetails.parties.map((party, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{party.name}</h4>
                            <Badge variant="outline">{party.role}</Badge>
                            <Badge variant="secondary">{party.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Acting as {party.role} in this agreement
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Key Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Financial Terms</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contract Value:</span>
                        <span className="font-medium">{contractDetails.value}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment Terms:</span>
                        <span className="font-medium">Net 30</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Currency:</span>
                        <span className="font-medium">{contractDetails.currency}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Duration</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Start Date:</span>
                        <span className="font-medium">{contractDetails.startDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">End Date:</span>
                        <span className="font-medium">{contractDetails.endDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="font-medium">12 months</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">Important Clauses</h4>
                  <div className="space-y-3">
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-sm mb-2">Termination</h5>
                      <p className="text-sm text-muted-foreground">
                        Either party may terminate this agreement with 30 days written notice.
                      </p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-sm mb-2">Intellectual Property</h5>
                      <p className="text-sm text-muted-foreground">
                        All intellectual property remains with the respective owner.
                      </p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-sm mb-2">Governing Law</h5>
                      <p className="text-sm text-muted-foreground">
                        This agreement is governed by the laws of New York State.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
