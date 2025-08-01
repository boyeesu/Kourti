import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { contractsData } from "./contractsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Edit, GitBranch } from "lucide-react";

export default function ContractView() {
  const { id } = useParams();
  const contract = contractsData.find((c) => c.id === id);
  const [content] = useState(contract?.content ?? "");

  if (!contract) {
    return <div className="p-6">Contract not found.</div>;
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contract.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{contract.name}</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link to={`/contracts/${contract.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/contracts/${contract.id}/history`}>
              <GitBranch className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Contract Document</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {content}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
