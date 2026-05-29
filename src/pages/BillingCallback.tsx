import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useVerifyPayment } from '@/hooks/useSubscription';
import { useQueryClient } from '@tanstack/react-query';

type CallbackStatus = 'verifying' | 'success' | 'failed' | 'cancelled';

export default function BillingCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verifyPayment = useVerifyPayment();

  // Paystack callback ships `?reference=<ref>&trxref=<ref>` on return.
  // We also accept the legacy `?status=…&tx_ref=…` shape (Flutterwave-era)
  // so old links in flight don't dead-end here.
  const status = searchParams.get('status');
  const txRef =
    searchParams.get('reference') ?? searchParams.get('trxref') ?? searchParams.get('tx_ref');
  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>('verifying');
  const verifyStarted = useRef(false);

  useEffect(() => {
    if (status === 'cancelled') {
      setCallbackStatus('cancelled');
      return;
    }

    if (status === 'failed') {
      setCallbackStatus('failed');
      return;
    }

    // Paystack's callback has NO status param — landing here at all means
    // the user returned from the hosted checkout. The verify endpoint is the
    // authoritative answer; we kick it off whenever we have a reference and
    // the legacy `status` param is either absent or affirmative.
    const looksSuccessful = !status || status === 'successful' || status === 'completed';
    if (looksSuccessful && txRef && !verifyStarted.current) {
      verifyStarted.current = true;
      setCallbackStatus('verifying');

      let attempts = 0;
      const maxAttempts = 8;

      const attemptVerification = async () => {
        attempts++;
        try {
          const result = await verifyPayment.mutateAsync({ tx_ref: txRef });

          if (result.payment_status === 'successful') {
            setCallbackStatus('success');
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['payment-history'] });
            queryClient.invalidateQueries({ queryKey: ['organization-billing'] });
            queryClient.invalidateQueries({ queryKey: ['current-user-plan'] });
            // Refresh trial-status so the TrialExpiredModal closes immediately
            // instead of waiting on React Query's staleTime to expire.
            queryClient.invalidateQueries({ queryKey: ['trial-status'] });
            return;
          }

          if (result.payment_status === 'failed') {
            setCallbackStatus('failed');
            return;
          }

          // Still pending — retry after delay
          if (attempts < maxAttempts) {
            setTimeout(attemptVerification, 3000);
          } else {
            // After max attempts, show success optimistically (webhook may still process)
            setCallbackStatus('success');
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['payment-history'] });
            queryClient.invalidateQueries({ queryKey: ['organization-billing'] });
            queryClient.invalidateQueries({ queryKey: ['current-user-plan'] });
            // Refresh trial-status so the TrialExpiredModal closes immediately
            // instead of waiting on React Query's staleTime to expire.
            queryClient.invalidateQueries({ queryKey: ['trial-status'] });
          }
        } catch {
          if (attempts < maxAttempts) {
            setTimeout(attemptVerification, 3000);
          } else {
            setCallbackStatus('failed');
          }
        }
      };

      // Initial delay to give Flutterwave time to process
      setTimeout(attemptVerification, 2000);
    }

    // Unknown status
    if (!status || !['successful', 'completed', 'cancelled', 'failed'].includes(status)) {
      setCallbackStatus('failed');
    }
  }, [status, txRef]); // eslint-disable-line react-hooks/exhaustive-deps

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
