import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { contractsData } from "./contractsData";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function ContractEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const contract = contractsData.find((c) => c.id === id);
  const [content, setContent] = useState(contract?.content ?? "");

  if (!contract) {
    return <div className="p-6">Contract not found.</div>;
  }

  const handleSave = () => {
    // Normally this would persist changes to a backend
    contract.content = content;
    navigate(`/contracts/${contract.id}`);
  };

  return (
    <div className="p-6 space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Edit {contract.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[300px]" />
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contracts/${contract.id}`}>Cancel</Link>
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
