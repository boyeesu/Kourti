import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkImportForm } from "@/components/BulkImportForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplateDownloader } from "@/components/TemplateDownloader";
import { ArrowLeft, Upload, Download, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function BulkImport() {
  const [searchParams] = useSearchParams();
  const importType = searchParams.get("type") || "clients";
  const [activeTab, setActiveTab] = useState(importType === "cases" ? "cases" : "clients");
  const navigate = useNavigate();

  // Set active tab based on URL parameter
  useEffect(() => {
    if (importType === "cases" || importType === "clients") {
      setActiveTab(importType);
    }
  }, [importType]);

  const handleImportComplete = () => {
    // Navigate back to the appropriate listing page after import
    setTimeout(() => {
      navigate(activeTab === "clients" ? "/clients" : "/cases");
    }, 2000);
  };

  return (
    <div className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
      <Breadcrumbs />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bulk Import</h1>
          <p className="text-muted-foreground">
            Import multiple records at once using CSV templates
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Instructions card */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-warning" />
            How to Use Bulk Import
          </CardTitle>
          <CardDescription>
            Follow these steps to successfully import your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 list-decimal pl-5">
            <li>
              <span className="font-medium">Download the template</span> for the
              type of data you want to import
            </li>
            <li>
              <span className="font-medium">Fill in the spreadsheet</span> with
              your data (do not modify column headers)
            </li>
            <li>
              <span className="font-medium">Save the file</span> as CSV format
              (.csv)
            </li>
            <li>
              <span className="font-medium">Upload the CSV file</span> using the
              form below
            </li>
            <li>
              <span className="font-medium">Review the results</span> and fix
              any errors if needed
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Template downloads */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5" />
            Download Templates
          </CardTitle>
          <CardDescription>
            Get started by downloading the appropriate template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TemplateDownloader
              title="Clients Template"
              description="Import clients with contact details"
              entityType="clients"
              icon={<Upload className="h-5 w-5" />}
            />
            <TemplateDownloader
              title="Cases Template"
              description="Import cases with client references"
              entityType="cases"
              icon={<Upload className="h-5 w-5" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Import tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="clients">Import Clients</TabsTrigger>
          <TabsTrigger value="cases">Import Cases</TabsTrigger>
        </TabsList>
        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import Clients</CardTitle>
              <CardDescription>
                Upload a CSV file to import multiple clients at once
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkImportForm
                entityType="clients"
                onImportComplete={handleImportComplete}
              />
              
              <Alert className="mt-6 bg-muted/30">
                <AlertTitle className="font-medium">Client CSV Format</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-2">
                  <p>Required columns: <code className="bg-muted p-0.5 rounded">name</code></p>
                  <p>Optional columns: <code className="bg-muted p-0.5 rounded">email</code>, <code className="bg-muted p-0.5 rounded">phone</code>, <code className="bg-muted p-0.5 rounded">address</code>, <code className="bg-muted p-0.5 rounded">company</code>, <code className="bg-muted p-0.5 rounded">notes</code>, <code className="bg-muted p-0.5 rounded">status</code></p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cases" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import Cases</CardTitle>
              <CardDescription>
                Upload a CSV file to import multiple cases at once
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkImportForm
                entityType="cases"
                onImportComplete={handleImportComplete}
              />
              
              <Alert className="mt-6 bg-muted/30">
                <AlertTitle className="font-medium">Case CSV Format</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-2">
                  <p>Required columns: <code className="bg-muted p-0.5 rounded">name</code>, <code className="bg-muted p-0.5 rounded">client</code>, <code className="bg-muted p-0.5 rounded">status</code></p>
                  <p>Optional columns: <code className="bg-muted p-0.5 rounded">description</code>, <code className="bg-muted p-0.5 rounded">priority</code>, <code className="bg-muted p-0.5 rounded">due_date</code></p>
                  <p>Note: The <code className="bg-muted p-0.5 rounded">client</code> column should contain the client's name as it appears in the system</p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}