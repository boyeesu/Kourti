import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input"; // Added from main branch
import { Badge } from "@/components/ui/badge"; // Added from main branch
import { useCases } from "@/context/CasesContext"; // Added from main branch

export default function Settings() {
  // State from codex/implement-users-and-settings-view
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // State and hook from main branch
  const { statuses, addStatus } = useCases();
  const [newStatus, setNewStatus] = useState("");

  // Function from main branch
  const handleAdd = () => {
    const trimmed = newStatus.trim();
    if (trimmed) {
      addStatus(trimmed);
      setNewStatus("");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header section from codex/implement-users-and-settings-view */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure your account preferences</p>
        </div>
        <Button className="shadow-md">Save Changes</Button>
      </div>

      {/* Account settings card from codex/implement-users-and-settings-view */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your personal settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive updates about activity
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="two-factor">Two-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">
                Extra security on sign in
              </p>
            </div>
            <Switch
              id="two-factor"
              checked={twoFactor}
              onCheckedChange={setTwoFactor}
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance settings card from codex/implement-users-and-settings-view */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode">Dark Mode</Label>
            <Switch
              id="dark-mode"
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
          </div>
        </CardContent>
      </Card>

      {/* Case Statuses card from main branch */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Case Statuses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <Badge key={status} variant="outline">
                {status}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            />
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}