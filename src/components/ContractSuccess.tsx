import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Eye, Edit, Share, Bot, FileText, Download, Save, X } from "lucide-react";
import { Link } from "react-router-dom";
import { RichTextEditor } from "@/components/RichTextEditor";
import { exportAsDocx, exportContractAsPdf } from "@/lib/documentExport";
import { useUpdateContract } from "@/hooks/useContracts";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


interface ContractSuccessProps {
  contract: {
    id: string;
    title: string;
    status: string;
    contract_type?: string;
    terms?: string;
    value?: number;
    currency?: string;
    start_date?: string;
    end_date?: string;
  };
  onViewContract: () => void;
}

export function ContractSuccess({ contract, onViewContract }: ContractSuccessProps) {
  const [editedContent, setEditedContent] = useState(contract.terms || "");
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");
  const updateContract = useUpdateContract();
  const { toast } = useToast();

  const handleSaveEdit = async () => {
    try {
      await updateContract.mutateAsync({
        id: contract.id,
        terms: editedContent,
      });
      setActiveTab("preview");
      toast({
        title: "Success",
        description: "Contract updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save changes.",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(contract.terms || "");
    setActiveTab("preview");
  };


  const handleDownloadPdf = async () => {
    try {
      await exportContractAsPdf(
        {
          title: contract.title,
          content: contract.terms || "",
          type: contract.contract_type,
          value: contract.value,
          currency: contract.currency,
          startDate: contract.start_date,
          endDate: contract.end_date,
        },
        contract.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      );
      toast({
        title: "Success",
        description: "Contract downloaded as PDF.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to download PDF.",
      });
    }
  };

  const handleDownloadDocx = async () => {
    try {
      await exportAsDocx(
        contract.terms || "",
        contract.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      );
      toast({
        title: "Success",
        description: "Contract downloaded as DOCX.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to download DOCX.",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="w-full max-w-4xl shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-700">Contract Successfully Generated!</CardTitle>
          <p className="text-muted-foreground mt-2">
            Your contract has been created using AI. You can review, edit, and download it below.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Contract Metadata */}
          <div className="bg-muted/30 p-4 rounded-lg border">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{contract.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {contract.status}
                  </Badge>
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                    <Bot className="h-3 w-3 mr-1" />
                    AI Generated
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Type: {contract.contract_type || 'Contract'}
                </p>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleDownloadPdf}>
                      Download as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadDocx}>
                      Download as DOCX
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Important Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-amber-600 text-sm font-bold">!</span>
              </div>
              <div>
                <h4 className="font-medium text-amber-800 mb-1">Review Required</h4>
                <p className="text-sm text-amber-700">
                  This contract was generated by AI and should be reviewed by legal counsel before use.
                  Please verify all terms, conditions, and details are accurate.
                </p>
              </div>
            </div>
          </div>

          {/* Contract Content with Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "edit")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="edit">
                <Edit className="h-4 w-4 mr-2" />
                Edit Live
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div
                    className="prose prose-sm sm:prose lg:prose-lg max-w-none"
                    dangerouslySetInnerHTML={{ __html: contract.terms || "" }}
                    style={{
                      lineHeight: '1.8',
                      fontSize: '0.95rem',
                    }}
                  />
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button onClick={() => setActiveTab("edit")}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Contract
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="edit" className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <RichTextEditor
                    content={editedContent}
                    onChange={setEditedContent}
                    editable={true}
                  />
                </CardContent>
              </Card>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={updateContract.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {updateContract.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              onClick={onViewContract}
              variant="outline"
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Full Contract
            </Button>

            <Button variant="outline" className="flex-1">
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>

          {/* Quick Actions */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">Quick Actions:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/contracts/create">
                  Create Another Contract
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/contracts">
                  Back to Contracts
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/ream-ai?contract=${contract.id}`}>
                  <Bot className="h-3 w-3 mr-1" />
                  AI Analysis
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}