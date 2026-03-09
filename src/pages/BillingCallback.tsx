import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useCurrentSubscription } from '@/hooks/useSubscription';
import { useQueryClient } from '@tanstack/react-query';

type CallbackStatus = 'verifying' | 'success' | 'failed' | 'cancelled';

export default function BillingCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: subscription, refetch } = useCurrentSubscription();

  const status = searchParams.get('status');
  const txRef = searchParams.get('tx_ref');
  const transactionId = searchParams.get('transaction_id');

  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>('verifying');
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (status === 'cancelled') {
      setCallbackStatus('cancelled');
      return;
    }

    if (status === 'failed') {
      setCallbackStatus('failed');
      return;
    }

    // For successful payments, poll for the webhook to process
    if (status === 'successful' || status === 'completed') {
      setCallbackStatus('verifying');

      const interval = setInterval(async () => {
        setPollCount((prev) => {
          const next = prev + 1;
          if (next >= 10) {
            // After ~20 seconds, assume success (webhook may still be processing)
            clearInterval(interval);
            setCallbackStatus('success');
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['payment-history'] });
            queryClient.invalidateQueries({ queryKey: ['organization-billing'] });
            queryClient.invalidateQueries({ queryKey: ['current-user-plan'] });
          }
          return next;
        });

        const { data: updated } = await refetch();
        if (updated) {
          clearInterval(interval);
          setCallbackStatus('success');
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
          queryClient.invalidateQueries({ queryKey: ['payment-history'] });
          queryClient.invalidateQueries({ queryKey: ['organization-billing'] });
          queryClient.invalidateQueries({ queryKey: ['current-user-plan'] });
        }
      }, 2000);

      return () => clearInterval(interval);
    }

    // Unknown status
    setCallbackStatus('failed');
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusConfig = {
    verifying: {
      icon: <Loader2 className="h-12 w-12 animate-spin text-primary" />,
      title: 'Verifying Payment',
      description: 'Please wait while we confirm your payment with Flutterwave...',
      showActions: false,
    },
    success: {
      icon: <CheckCircle2 className="h-12 w-12 text-green-500" />,
      title: 'Payment Successful!',
      description:
        'Your subscription has been activated. You now have access to all premium features.',
      showActions: true,
    },
    failed: {
      icon: <XCircle className="h-12 w-12 text-red-500" />,
      title: 'Payment Failed',
      description:
        'Your payment could not be processed. Please try again or contact support if the issue persists.',
      showActions: true,
    },
    cancelled: {
      icon: <AlertTriangle className="h-12 w-12 text-yellow-500" />,
      title: 'Payment Cancelled',
      description: 'You cancelled the payment. No charges were made to your account.',
      showActions: true,
    },
  };

  const config = statusConfig[callbackStatus];

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">{config.icon}</div>
          <CardTitle className="text-2xl">{config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">{config.description}</p>

          {txRef && <p className="text-xs text-muted-foreground">Reference: {txRef}</p>}

          {config.showActions && (
            <div className="flex flex-col gap-3">
              <Button onClick={() => navigate('/settings?tab=billing')}>Go to Billing</Button>
              {callbackStatus === 'failed' && (
                <Button variant="outline" onClick={() => navigate('/settings?tab=billing')}>
                  Try Again
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
