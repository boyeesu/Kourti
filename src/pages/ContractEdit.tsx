import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useContract, useUpdateContract, useDeleteContract } from "@/hooks/useContracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileText, 
  AlertTriangle,
  Eye,
  Loader2
} from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';

export default function ContractEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: contract, isLoading } = useContract(id!);
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const { createContractNotification } = useNotificationTriggers();
  const [isModified, setIsModified] = useState(false);
  const [activeTab, setActiveTab] = useState("content");

  const [contractData, setContractData] = useState({
    title: "",
    description: "",
    status: "draft" as string,
    contract_type: "",
    value: 0,
    currency: "USD",
    start_date: "",
    end_date: "",
    terms: "",
  });

  useEffect(() => {
    if (contract) {
      setContractData({
        title: contract.title || "",
        description: contract.description || "",
        status: contract.status || "draft",
        contract_type: contract.contract_type || "",
        value: contract.value || 0,
        currency: contract.currency || "USD",
        start_date: contract.start_date || "",
        end_date: contract.end_date || "",
        terms: contract.terms || "",
      });
    }
  }, [contract]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-6">
        <Breadcrumbs />
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

  const handleSave = async () => {
    try {
      const updatedContract = await updateContract.mutateAsync({
        id: id!,
        ...contractData,
      });
      // Create notification
      await createContractNotification(updatedContract, 'updated');
      setIsModified(false);
      navigate(`/contracts/${id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    try {
      // Create notification before deletion
      if (contract) {
        await createContractNotification(contract, 'deleted');
      }
      await deleteContract.mutateAsync(id!);
      navigate("/contracts");
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleChange = (field: string, value: any) => {
    setContractData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsModified(true);
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/contracts/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Edit Contract</h1>
            <p className="text-muted-foreground">{contract.title}</p>
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
            <Link to={`/contracts/${id}`}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!isModified || updateContract.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateContract.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Save Contract Changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will update the contract with your changes.
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
        </TabsList>

        <TabsContent value="content" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contract Content</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contractTitle">Contract Title</Label>
                <Input
                  id="contractTitle"
                  value={contractData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Enter contract title"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contractDescription">Description</Label>
                <Textarea
                  id="contractDescription"
                  value={contractData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Enter contract description..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractTerms">Terms & Conditions</Label>
                <Textarea
                  id="contractTerms"
                  value={contractData.terms}
                  onChange={(e) => handleChange('terms', e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Enter contract terms..."
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
                  <Select value={contractData.contract_type} onValueChange={(value) => handleChange('contract_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
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
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Contract Value</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={contractData.value}
                      onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
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
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={contractData.start_date}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={contractData.end_date}
                    onChange={(e) => handleChange('end_date', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete a contract, there is no going back. Please be certain.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                Delete Contract
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the contract.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Contract
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
