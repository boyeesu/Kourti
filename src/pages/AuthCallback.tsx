import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/kourti-legal-logo.png";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [statusMessage, setStatusMessage] = useState("Finishing your sign-in...");

  useEffect(() => {
    let isMounted = true;

    const finalizeAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        const sessionUser = sessionData.session?.user;
        if (!sessionUser) {
          throw new Error("No active session found. Please sign in again.");
        }

        setStatusMessage("Checking your workspace...");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", sessionUser.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (!isMounted) return;

        if (profile?.organization_id) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/onboarding", { replace: true });
        }
      } catch (error: any) {
        if (!isMounted) return;
        toast({
          variant: "destructive",
          title: "Sign-in failed",
          description: error?.message || "Unable to complete sign-in. Please try again.",
        });
        navigate("/auth", { replace: true });
      }
    };

    finalizeAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="Kourti Legal" className="h-12 w-12" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Almost there</CardTitle>
            <p className="text-muted-foreground mt-2">{statusMessage}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Please wait while we prepare your account.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
