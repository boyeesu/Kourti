import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { contractsData } from "./contractsData";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  Save, 
  X, 
  FileText, 
  Users, 
  Settings, 
  AlertTriangle,
  History,
  Eye
} from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useOrganizationMembers } from "@/hooks/useOrganization";

export default function ContractEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const contract = contractsData.find((c) => c.id === id);
  const { data: profile } = useProfile();
  const { data: orgMembers = [] } = useOrganizationMembers();
  const [isModified, setIsModified] = useState(false);
  const [activeTab, setActiveTab] = useState("content");

  // Enhanced contract state
  const [contractData, setContractData] = useState({
    name: contract?.name || "",
    content: contract?.content || "",
    status: "Active",
    type: "Software License Agreement",
    assignedTo: "Sarah Wilson",
    parties: [
      { name: "Acme Corp", role: "Licensor", email: "legal@acme.com" },
      { name: "Client Company", role: "Licensee", email: "contracts@client.com" }
    ],
    value: "50000",
    currency: "USD",
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    tags: ["Software", "License", "Commercial"]
  });

  if (!contract) {
    return (
      <div className="p-6">
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Contract Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The contract you're trying to edit doesn't exist or has been removed.
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

  const handleSave = () => {
    console.log("Saving contract:", contractData);

    // Create new version entry
    const newVersion = {
      version: contract.versions.length + 1,
      date: new Date().toISOString().split('T')[0],
      description: "Contract updated",
      editedBy: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown User" : "Unknown User",
    };
    
    // Update contract data
    contract.content = contractData.content;
    contract.name = contractData.name;
    contract.versions.push(newVersion);
    
    setIsModified(false);
    alert("Contract saved (simulated).");
    navigate(`/contracts/${contract.id}`);
  };

  const handleChange = (field: string, value: any) => {
    setContractData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsModified(true);
  };

  const addTag = (tag: string) => {
    if (tag && !contractData.tags.includes(tag)) {
      handleChange('tags', [...contractData.tags, tag]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleChange('tags', contractData.tags.filter(tag => tag !== tagToRemove));
  };

  const addParty = () => {
    const newParty = {
      name: "",
      role: "",
      email: ""
    };
    handleChange('parties', [...contractData.parties, newParty]);
  };

  const updateParty = (index: number, field: string, value: string) => {
    const updatedParties = [...contractData.parties];
    updatedParties[index] = { ...updatedParties[index], [field]: value };
    handleChange('parties', updatedParties);
  };

  const removeParty = (index: number) => {
    if (contractData.parties.length > 1) {
      const updatedParties = contractData.parties.filter((_, i) => i !== index);
      handleChange('parties', updatedParties);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/contracts/${contract.id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Edit Contract</h1>
            <p className="text-muted-foreground">{contract.name}</p>
          </div>
          {isModified && (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Unsaved Changes
            </Badge>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contracts/${contract.id}/history`}>
              <History className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/contracts/${contract.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!isModified}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Save Contract Changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new version of the contract. All changes will be tracked in the version history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSave}>Save Changes</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="content">Document Content</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contract Content</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {contractData.content.length} characters
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contractName">Contract Name</Label>
                <Input
                  id="contractName"
                  value={contractData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter contract name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contractContent">Contract Text</Label>
                <Textarea
                  id="contractContent"
                  value={contractData.content}
                  onChange={(e) => handleChange('content', e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Enter contract content..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Contract Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select value={contractData.type} onValueChange={(value) => handleChange('type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Software License Agreement">Software License Agreement</SelectItem>
                      <SelectItem value="Service Agreement">Service Agreement</SelectItem>
                      <SelectItem value="Non-Disclosure Agreement">Non-Disclosure Agreement</SelectItem>
                      <SelectItem value="Employment Contract">Employment Contract</SelectItem>
                      <SelectItem value="Purchase Agreement">Purchase Agreement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={contractData.status} onValueChange={(value) => handleChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Expired">Expired</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Contract Value</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={contractData.value}
                      onChange={(e) => handleChange('value', e.target.value)}
                      placeholder="0"
                    />
                    <Select value={contractData.currency} onValueChange={(value) => handleChange('currency', value)}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select value={contractData.assignedTo} onValueChange={(value) => handleChange('assignedTo', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {profile && (
                        <SelectItem value={profile.user_id}>
                          Me ({profile.first_name || ""} {profile.last_name || ""})
                        </SelectItem>
                      )}
                      {orgMembers
                        .filter(({ user_id }) => !profile || user_id !== profile.user_id)
                        .map(user => (
                          <SelectItem key={user.user_id} value={user.user_id}>
                            {user.first_name} {user.last_name} ({user.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={contractData.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={contractData.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {contractData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addTag(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const input = document.querySelector('input[placeholder="Add a tag..."]') as HTMLInputElement;
                      if (input?.value) {
                        addTag(input.value);
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parties" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contract Parties</CardTitle>
                <Button onClick={addParty} variant="outline" size="sm">
                  <Users className="h-4 w-4 mr-2" />
                  Add Party
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {contractData.parties.map((party, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="font-medium">Party {index + 1}</h4>
                      {contractData.parties.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeParty(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={party.name}
                          onChange={(e) => updateParty(index, 'name', e.target.value)}
                          placeholder="Party name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Input
                          value={party.role}
                          onChange={(e) => updateParty(index, 'role', e.target.value)}
                          placeholder="e.g., Licensor, Client"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={party.email}
                          onChange={(e) => updateParty(index, 'email', e.target.value)}
                          placeholder="contact@example.com"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Contract Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Permissions</h4>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked />
                      <span className="text-sm">Allow public viewing</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked />
                      <span className="text-sm">Enable version tracking</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" />
                      <span className="text-sm">Require approval for changes</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Notifications</h4>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked />
                      <span className="text-sm">Email notifications for changes</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" />
                      <span className="text-sm">Expiration reminders</span>
                    </label>
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
