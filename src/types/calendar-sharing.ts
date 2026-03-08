// Calendar Sharing Types
// Extended types for team calendar functionality

export interface CalendarShare {
  id: string;
  calendar_owner_id: string;
  shared_with_user_id: string;
  organization_id: string;
  permission_level: 'view' | 'edit';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarShareWithUsers extends CalendarShare {
  owner_email: string;
  owner_name: string;
  owner_color: string;
  shared_with_email: string;
  shared_with_name: string;
}

export interface SharedCalendar {
  calendar_owner_id: string;
  owner_email: string;
  owner_name: string;
  permission_level: 'view' | 'edit';
  calendar_color: string;
}

export interface CalendarViewer {
  shared_with_user_id: string;
  viewer_email: string;
  viewer_name: string;
  permission_level: 'view' | 'edit';
}

export interface CreateCalendarShareData {
  shared_with_user_id: string;
  permission_level: 'view' | 'edit';
}

export interface UpdateCalendarShareData {
  permission_level?: 'view' | 'edit';
  is_active?: boolean;
}

// Extended CalendarEvent with owner information
export interface CalendarEventWithOwner {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  attendees?: string[] | null;
  event_type?: string | null;
  case_id?: string | null;
  client_id?: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
  reminder_date?: string;
  external_event_id?: string | null;
  external_source?: 'google_calendar' | 'microsoft_teams';
  external_calendar_id?: string | null;
  source?: 'internal' | 'google_calendar' | 'microsoft_teams';
  is_recurring?: boolean;
  recurrence_pattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
  };
  recurrence_end_date?: string;
  parent_event_id?: string;
  recurrence_instance_id?: string;
  conflict_detected?: boolean;
  conflict_with?: {
    event_id?: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    created_by?: string;
  };
  owner_name?: string;
  owner_email?: string;
  owner_color?: string;
}

// Filter options for calendar
export interface CalendarFilters {
  eventTypes: string[];
  sharedCalendars: string[]; // owner_ids of shared calendars to show
  searchTerm: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Availability slot for scheduling
export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
  conflictingEvents?: CalendarEventWithOwner[];
}

export interface UserAvailability {
  user_id: string;
  user_name: string;
  user_email: string;
  slots: AvailabilitySlot[];
}
