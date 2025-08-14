import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export default function GeneralTab() {
  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Manage your general account settings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">General settings content coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
