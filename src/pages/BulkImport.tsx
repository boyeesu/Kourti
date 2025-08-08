import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BulkImportForm } from "@/components/BulkImportForm";
import { TemplateDownloader } from "@/components/TemplateDownloader";
import { Upload, Users, Briefcase, FileText, FileCheck } from "lucide-react";

// Template data for each entity type
const templateData = {
  clients: {
    fields: ["name", "email", "phone", "type", "address", "primaryContact", "industry", "website", "status"],
    samples: [
      {
        name: "Sample Corp",
        email: "contact@samplecorp.com",
        phone: "+1 (555) 123-4567",
        type: "Corporate",
        address: "123 Business St, City, State 12345",
        primaryContact: "John Doe",
        industry: "Technology",
        website: "www.samplecorp.com",
        status: "Active"
      },
      {
        name: "Tech Startup",
        email: "hello@techstartup.com", 
        phone: "+1 (555) 987-6543",
        type: "Startup",
        address: "456 Innovation Ave, City, State 67890",
        primaryContact: "Jane Smith",
        industry: "Software",
        website: "www.techstartup.com",
        status: "Active"
      }
    ]
  },
  cases: {
    fields: ["name", "client", "status", "stage", "priority", "assignedTo", "startDate", "dueDate", "description"],
    samples: [
      {
        name: "Contract Dispute Resolution",
        client: "Sample Corp",
        status: "Active",
        stage: "Investigation",
        priority: "High",
        assignedTo: "Sarah Wilson",
        startDate: "2024-01-15",
        dueDate: "2024-03-15",
        description: "Commercial contract dispute requiring immediate attention"
      },
      {
        name: "Intellectual Property Review",
        client: "Tech Startup", 
        status: "Draft",
        stage: "Assessment",
        priority: "Medium",
        assignedTo: "Michael Chen",
        startDate: "2024-02-01",
        dueDate: "2024-04-01",
        description: "Patent and trademark portfolio review"
      }
    ]
  },
  contracts: {
    fields: ["name", "client", "type", "status", "startDate", "endDate", "value", "description"],
    samples: [
      {
        name: "Master Service Agreement",
        client: "Sample Corp",
        type: "Service Agreement",
        status: "Active",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        value: "$250,000",
        description: "Annual service agreement for legal consulting"
      },
      {
        name: "Software License Agreement",
        client: "Tech Startup",
        type: "License",
        status: "Under Review",
        startDate: "2024-02-15",
        endDate: "2025-02-15",
        value: "$100,000",
        description: "Software licensing agreement for proprietary technology"
      }
    ]
  },
  documents: {
    fields: ["name", "type", "linkedCase", "category", "uploadedBy", "description", "tags"],
    samples: [
      {
        name: "Contract_Amendment_v2.pdf",
        type: "PDF",
        linkedCase: "Contract Dispute Resolution",
        category: "Legal Document",
        uploadedBy: "Sarah Wilson",
        description: "Amended contract terms for review",
        tags: "contract, amendment, legal"
      },
      {
        name: "Evidence_Documentation.docx",
        type: "DOCX", 
        linkedCase: "Intellectual Property Review",
        category: "Evidence",
        uploadedBy: "Michael Chen",
        description: "Supporting evidence for IP claims",
        tags: "evidence, IP, documentation"
      }
    ]
  }
};

export default function BulkImport() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type") || "clients";

  const handleImportComplete = (entityType: string, data: any[]) => {
    console.log(`Imported ${data.length} ${entityType}:`, data);
    // In real app, this would update the global state/database
  };

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bulk Import</h1>
          <p className="text-muted-foreground">
            Import multiple records using CSV files. Download templates to ensure proper formatting.
          </p>
        </div>
      </div>

      {/* Import Tabs */}
      <Tabs value={typeParam} className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="cases" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
        </TabsList>

        {/* Clients Import */}
        <TabsContent value="clients" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BulkImportForm 
                entityType="clients" 
                onImportComplete={(data) => handleImportComplete("clients", data)}
              />
            </div>
            <div>
              <TemplateDownloader
                entityType="clients"
                fields={templateData.clients.fields}
                sampleData={templateData.clients.samples}
              />
            </div>
          </div>
        </TabsContent>

        {/* Cases Import */}
        <TabsContent value="cases" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BulkImportForm 
                entityType="cases" 
                onImportComplete={(data) => handleImportComplete("cases", data)}
              />
            </div>
            <div>
              <TemplateDownloader
                entityType="cases"
                fields={templateData.cases.fields}
                sampleData={templateData.cases.samples}
              />
            </div>
          </div>
        </TabsContent>

        {/* Contracts Import */}
        <TabsContent value="contracts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BulkImportForm 
                entityType="contracts" 
                onImportComplete={(data) => handleImportComplete("contracts", data)}
              />
            </div>
            <div>
              <TemplateDownloader
                entityType="contracts"
                fields={templateData.contracts.fields}
                sampleData={templateData.contracts.samples}
              />
            </div>
          </div>
        </TabsContent>

        {/* Documents Import */}
        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BulkImportForm 
                entityType="documents" 
                onImportComplete={(data) => handleImportComplete("documents", data)}
              />
            </div>
            <div>
              <TemplateDownloader
                entityType="documents"
                fields={templateData.documents.fields}
                sampleData={templateData.documents.samples}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Instructions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Import Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">📋 Preparation Steps</h4>
              <ol className="text-sm text-muted-foreground space-y-1">
                <li>1. Download the appropriate CSV template</li>
                <li>2. Fill in your data following the sample format</li>
                <li>3. Ensure all required fields are completed</li>
                <li>4. Save your file as CSV format</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium mb-2">⚠️ Important Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Keep the header row intact</li>
                <li>• Use comma-separated values only</li>
                <li>• Maximum file size: 10MB</li>
                <li>• Duplicate entries will be skipped</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}