import { ContractUploadDialog } from "@/components/contracts/ContractUploadDialog";
import { useNavigate } from "react-router-dom";

export default function ContractUpload() {
  const navigate = useNavigate();
  
  return (
    <div className="p-6">
      <ContractUploadDialog 
        open={true} 
        onOpenChange={(open) => {
          if (!open) navigate("/contracts");
        }} 
      />
    </div>
  );
}