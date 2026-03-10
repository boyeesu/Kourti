import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logError } from '@/lib/logger';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AppLogo } from '@/components/ui/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Normalize email to lowercase
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error('Error', { description: 'Please enter a valid email address.' });
      setLoading(false);
      return;
    }

    const { error } = await resetPassword(normalizedEmail);
    if (error) {
      logError('Password reset error', error);

      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to send password reset email. Please try again.';

      // Check for specific error types - use generic messages to avoid leaking internal details
      if (
        error.message?.includes('504') ||
        error.message?.includes('timeout') ||
        error.message?.includes('Gateway')
      ) {
        errorMessage = 'The request timed out. Please try again in a moment.';
      } else if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
        errorMessage = 'Password reset is not available. Please contact your administrator.';
      } else if (error.message?.includes('redirect') || error.message?.includes('URL')) {
        errorMessage = 'Unable to process your request. Please contact your administrator.';
      }

      toast.error('Error', { description: errorMessage });
      setLoading(false);
      return;
    }

    // Log success in development
    if (import.meta.env.DEV) {
      console.log('Password reset email sent successfully');
    }

    setEmailSent(true);
    setLoading(false);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <AppLogo size="md" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">Check Your Email</CardTitle>
              <p className="text-muted-foreground mt-2">
                We've sent a password reset link to {email}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-4">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-2 text-sm text-muted-foreground">
                <p>
                  Click the link in the email to reset your password. The link will expire in 1
                  hour.
                </p>
                <p>If you don't see the email, check your spam folder.</p>
                <p className="text-xs text-muted-foreground/80">
                  Note: If the email doesn't arrive, the email address may not be registered, or
                  email delivery may be delayed.
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setEmailSent(false);
                  setEmail('');
                }}
              >
                Send Another Email
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Forgot Password</CardTitle>
            <p className="text-muted-foreground mt-2">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>

          <div className="mt-6">
            <Separator className="my-4" />
            <div className="text-center">
              <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
