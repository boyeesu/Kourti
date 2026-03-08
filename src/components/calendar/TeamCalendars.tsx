import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Share2, Eye, Pencil, User } from 'lucide-react';
import { useSharedCalendars, useOrganizationMembersForSharing } from '@/hooks/useCalendarSharing';
import { ShareCalendarDialog } from './ShareCalendarDialog';
import { ManageCalendarSharesDialog } from './ManageCalendarSharesDialog';

interface TeamCalendarsProps {
  selectedCalendars: string[];
  onCalendarToggle: (ownerId: string, checked: boolean) => void;
}

export function TeamCalendars({ selectedCalendars, onCalendarToggle }: TeamCalendarsProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const { data: sharedCalendars, isLoading } = useSharedCalendars();
  const { data: members } = useOrganizationMembersForSharing();

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Calendars
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowShareDialog(true)}
              title="Share my calendar"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowManageDialog(true)}
              title="Manage shares"
            >
              <User className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : sharedCalendars && sharedCalendars.length > 0 ? (
          <div className="space-y-2">
            {sharedCalendars.map((calendar) => (
              <div
                key={calendar.calendar_owner_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  id={`calendar-${calendar.calendar_owner_id}`}
                  checked={selectedCalendars.includes(calendar.calendar_owner_id)}
                  onCheckedChange={(checked) =>
                    onCalendarToggle(calendar.calendar_owner_id, checked as boolean)
                  }
                />
                <label
                  htmlFor={`calendar-${calendar.calendar_owner_id}`}
                  className="flex-1 flex items-center gap-2 cursor-pointer"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: calendar.calendar_color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {calendar.owner_name || calendar.owner_email}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {calendar.permission_level === 'edit' ? (
                        <>
                          <Pencil className="h-3 w-3" />
                          Can edit
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          View only
                        </>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No shared calendars yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Share your calendar or ask team members to share theirs
            </p>
          </div>
        )}
      </CardContent>

      <ShareCalendarDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        members={members || []}
      />

      <ManageCalendarSharesDialog open={showManageDialog} onOpenChange={setShowManageDialog} />
    </Card>
  );
}
