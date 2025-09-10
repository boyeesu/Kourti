import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { BulkImportForm } from "@/components/BulkImportForm";
import { TemplateDownloader } from "@/components/TemplateDownloader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload, Download } from "lucide-react";
import { toast } from "sonner";

const BulkImport = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const entityType = searchParams.get("type") as "clients" | "cases";
  
  // Redirect if no valid entity type
  useEffect(() => {
    if (!entityType || !["clients", "cases"].includes(entityType)) {
      toast.error("Invalid import type");
      navigate("/dashboard");
    }
  }, [entityType, navigate]);

  const handleImportComplete = (data: any[]) => {
    toast.success(`Successfully imported ${data.length} ${entityType}`);
    // Navigate back to the respective module
    navigate(entityType === "clients" ? "/clients" : "/cases");
  };

  if (!entityType || !["clients", "cases"].includes(entityType)) {
    return null;
  }

  const entityConfig = {
    clients: {
      title: "Client",
      fields: ["name", "email", "phone", "address", "company", "notes", "status"],
      sampleData: {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1 234 567 8900",
        address: "123 Main St, City, State 12345",
        company: "Acme Corp",
        notes: "Important client notes",
        status: "active"
      }
    },
    cases: {
      title: "Case",
      fields: ["title", "description", "status", "priority", "client_name"],
      sampleData: {
        title: "Contract Dispute Case",
        description: "Client contract dispute resolution",
        status: "active",
        priority: "high",
        client_name: "John Doe"
      }
    }
  };

  const config = entityConfig[entityType];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(entityType === "clients" ? "/clients" : "/cases")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {config.title}s
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Bulk Import {config.title}s</h1>
          <p className="text-muted-foreground">Import multiple {entityType} from a CSV file</p>
        </div>
      </div>

      <Tabs defaultValue="import" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Data
          </TabsTrigger>
          <TabsTrigger value="template" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Template
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Import {config.title}s from CSV</CardTitle>
              <CardDescription>
                Upload a CSV file containing your {entityType} data. Make sure your CSV includes the required fields.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkImportForm 
                entityType={entityType} 
                onImportComplete={handleImportComplete}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="mt-6">
          <TemplateDownloader
            entityType={entityType}
            fields={config.fields}
            sampleData={[config.sampleData]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BulkImport;