import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProfile, useUpdateProfile, useChangePassword } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';

export default function ProfileTab() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { toast } = useToast();

  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    department: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        department: profile.department || '',
      });
    }
  }, [profile]);

  const handleProfileUpdate = () => {
    updateProfile.mutate(profileData, {
      onSuccess: () => toast({ title: 'Profile updated', description: 'Your profile was saved.' }),
      onError: err => toast({ variant: 'destructive', title: 'Error', description: err.message }),
    });
  };

  const handleChangePassword = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ variant: 'destructive', title: 'Mismatch', description: 'New passwords must match' });
      return;
    }
    changePassword.mutate(
      {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      },
      {
        onSuccess: () => toast({ title: 'Password changed', description: 'Your password was updated.' }),
        onError: err => toast({ variant: 'destructive', title: 'Error', description: err.message }),
      }
    );
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  if (profileLoading) {
    return <div>Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={profileData.first_name}
                onChange={e => setProfileData({ ...profileData, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={profileData.last_name}
                onChange={e => setProfileData({ ...profileData, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={profileData.phone}
              onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={profileData.department}
              onChange={e => setProfileData({ ...profileData, department: e.target.value })}
            />
          </div>
          <Button onClick={handleProfileUpdate} disabled={updateProfile.isLoading}>
            {updateProfile.isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current_password">Current Password</Label>
            <Input
              id="current_password"
              type="password"
              value={passwordData.currentPassword}
              onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">New Password</Label>
            <Input
              id="new_password"
              type="password"
              value={passwordData.newPassword}
              onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              type="password"
              value={passwordData.confirmPassword}
              onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
            />
          </div>
          {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
            <p className="text-sm text-destructive">Passwords do not match</p>
          )}
          <Button
            onClick={handleChangePassword}
            disabled={
              changePassword.isLoading ||
              !passwordData.currentPassword ||
              !passwordData.newPassword ||
              passwordData.newPassword !== passwordData.confirmPassword
            }
          >
            {changePassword.isLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
