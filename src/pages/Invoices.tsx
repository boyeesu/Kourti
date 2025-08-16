import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Invoices() {
  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Invoicing & Billing</h1>
        <Button variant="default" size="sm">
          New Invoice
        </Button>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-8">
            <div className="text-xl font-semibold mb-2">Coming Soon</div>
            <div>This page will allow you to create, send, and manage invoices. It will link them to clients and cases and support VAT and detailed breakdowns.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}