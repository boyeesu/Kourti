import { Link } from "react-router-dom";
import { ShieldOff, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const Unauthorized = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <ShieldOff className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-3xl font-bold">Access Restricted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p className="text-muted-foreground">
            You don&apos;t have the necessary permissions to view this area. If you
            believe this is a mistake, please contact your administrator to
            request access.
          </p>
          <Separator className="my-2" />
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unauthorized;
