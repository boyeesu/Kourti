
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TemplateDownloaderProps {
  entityType: "clients" | "cases" | "contracts" | "documents";
  fields: string[];
  sampleData: Record<string, unknown>[];
}

export function TemplateDownloader({ entityType, fields, sampleData }: TemplateDownloaderProps) {
  const generateCSV = () => {
    // Create CSV header
    const header = fields.join(",");
    
    // Create sample rows
    const rows = sampleData.map(row => 
      fields.map(field => {
        const value = row[field] || "";
        // Escape commas and quotes in CSV
        return typeof value === "string" && (value.includes(",") || value.includes('"')) 
          ? `"${value.replace(/"/g, '""')}"` 
          : value;
      }).join(",")
    );
    
    const csvContent = [header, ...rows].join("\n");
    return csvContent;
  };

  const downloadTemplate = () => {
    const csvContent = generateCSV();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${entityType}_import_template.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Download Template
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download a CSV template with the correct format and sample data for {entityType} import.
        </p>
        
        <div className="space-y-2">
          <p className="text-sm font-medium">Required Fields:</p>
          <div className="flex flex-wrap gap-1">
            {fields.map((field) => (
              <span 
                key={field} 
                className="text-xs bg-muted px-2 py-1 rounded"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
        
        <Button onClick={downloadTemplate} className="w-full hover-scale">
          <Download className="h-4 w-4 mr-2" />
          Download {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Template
        </Button>
      </CardContent>
    </Card>
  );
}