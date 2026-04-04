import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Bot, Loader2 } from 'lucide-react';
import { useCreateAgentJob } from '@/hooks/useAgentJobs';

interface MatterReviewButtonProps {
  caseId: string;
  caseTitle: string;
}

export function MatterReviewButton({ caseId, caseTitle }: MatterReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const createJob = useCreateAgentJob();

  const handleConfirm = async () => {
    try {
      const result = await createJob.mutateAsync({
        agentType: 'matter_review',
        input: { caseId },
      });
      setOpen(false);
      navigate(`/agents/${result.data.id}`);
    } catch {
      // Error handled by mutation onError
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Bot className="h-4 w-4" />
        AI Matter Review
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run AI Matter Review</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyze all documents, contracts, and activities for{' '}
              <strong>{caseTitle}</strong>. The agent will generate a risk report and status memo.
              This may take a few minutes depending on the number of documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={createJob.isPending}>
              {createJob.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Review'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
