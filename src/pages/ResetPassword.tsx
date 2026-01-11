import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/ui/AppLogo";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let authStateSubscription: { unsubscribe: () => void } | null = null;

    const verifyToken = async () => {
      try {
        // First, check URL hash for token (Supabase redirects with hash fragments)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');
        const refreshToken = hashParams.get('refresh_token');

        // If we have hash params, set the session first
        if (accessToken && type === 'recovery' && refreshToken) {
          const { data: { session: newSession }, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            if (mounted) {
              setTokenValid(false);
              toast({
                variant: "destructive",
                title: "Invalid reset link",
                description: error.message || "This password reset link is invalid or has expired.",
              });
              setTimeout(() => navigate('/forgot-password'), 3000);
            }
            return;
          }

          if (newSession?.user) {
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
            if (mounted) {
              setTokenValid(true);
              setVerifying(false);
            }
            return;
          }
        }

        // Check if there's already an active session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          if (mounted) {
            setTokenValid(true);
            setVerifying(false);
          }
          return;
        }

        // If no session and no hash params, the link is invalid
        if (!accessToken || type !== 'recovery') {
          if (mounted) {
            setTokenValid(false);
            toast({
              variant: "destructive",
              title: "Invalid reset link",
              description: "This password reset link is invalid or has expired.",
            });
            setTimeout(() => navigate('/forgot-password'), 3000);
          }
          return;
        }

      } catch {
        if (mounted) {
          setTokenValid(false);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to verify password reset link.",
          });
          setTimeout(() => navigate('/forgot-password'), 3000);
        }
      } finally {
        if (mounted) {
          setVerifying(false);
        }
      }
    };

    // Set up auth state listener to catch automatic session creation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session?.user)) {
        if (mounted) {
          setTokenValid(true);
          setVerifying(false);
          // Clear hash from URL
          if (window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    });
    authStateSubscription = subscription;

    // Initial verification
    verifyToken();

    return () => {
      mounted = false;
      if (authStateSubscription) {
        authStateSubscription.unsubscribe();
      }
    };
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "Please ensure both passwords are the same.",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
      });
      return;
    }

    setLoading(true);

    try {
      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      // Sign out to clear the recovery session before redirecting
      // This ensures a clean state when the user logs in with their new password
      await supabase.auth.signOut();

      toast({
        title: "Password reset successfully!",
        description: "Your password has been updated. You can now sign in with your new password.",
      });

      // Redirect to login after successful password reset
      navigate('/login');
    } catch (error: unknown) {
      console.error('Error resetting password:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to reset password. Please try again.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <Lock className="h-10 w-10 text-destructive" />
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold text-xl">Invalid Reset Link</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>This password reset link is invalid or has expired.</p>
                  <p className="text-xs">
                    <strong>Common reasons:</strong>
                  </p>
                  <ul className="text-xs text-left list-disc list-inside space-y-1 bg-muted/50 p-3 rounded-md">
                    <li>The link has already been used</li>
                    <li>The link has expired (reset links expire after 1 hour)</li>
                    <li>The link was clicked more than once</li>
                  </ul>
                  <p className="text-xs">
                    Please request a new password reset link.
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={() => navigate('/forgot-password')}
                className="w-full"
              >
                Request New Reset Link
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
            <CardTitle className="text-2xl font-semibold">Reset Your Password</CardTitle>
            <p className="text-muted-foreground mt-2">
              Enter your new password below.
            </p>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your new password"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your new password"
                  className="pl-10 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {password && confirmPassword && password === confirmPassword && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Passwords match</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || !confirmPassword || password !== confirmPassword}
            >
              {loading ? "Resetting password..." : "Reset Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

