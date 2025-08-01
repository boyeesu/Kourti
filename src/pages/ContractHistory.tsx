import { useParams, Link } from "react-router-dom";
import { contractsData } from "./contractsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";

export default function ContractHistory() {
  const { id } = useParams();
  const contract = contractsData.find((c) => c.id === id);

  if (!contract) {
    return <div className="p-6">Contract not found.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Version History - {contract.name}</h1>
        <Button asChild variant="outline">
          <Link to={`/contracts/${contract.id}`}> 
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Link>
        </Button>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contract.versions.map(v => (
                <TableRow key={v.version}>
                  <TableCell>v{v.version}</TableCell>
                  <TableCell>{v.date}</TableCell>
                  <TableCell>{v.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
