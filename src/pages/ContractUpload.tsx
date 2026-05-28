import { ContractUploadDialog } from '@/components/contracts/ContractUploadDialog';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';

export default function ContractUpload() {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <ContractUploadDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate('/contracts');
        }}
      />
    </PageContainer>
  );
}
