export interface CalendarEventInstance {
  id: string;
  parent_event_id: string;
  instance_date: string;
  start_date: string;
  end_date: string;
  is_exception: boolean;
  exception_type?: 'modified' | 'deleted' | 'added';
  modified_title?: string;
  modified_description?: string;
  modified_location?: string;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringEventPattern {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  weekOfMonth?: number; // 1-5 for "1st", "2nd", etc.
  dayOfMonth?: number;
  monthOfYear?: number;
  endAfterCount?: number;
}

export interface AdvancedRecurrenceConfig {
  // Weekly pattern: "Every 2 weeks on Tuesday and Thursday"
  weeklyDays?: number[];

  // Monthly pattern: "Monthly on the 3rd Tuesday"
  monthlyWeekOfMonth?: number;
  monthlyDayOfWeek?: number;

  // End conditions
  endDate?: string;
  endAfterOccurrences?: number;
  neverEnd?: boolean;

  // Exceptions
  excludeDates?: string[];
}

export interface EventWithInstances {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  event_type?: string;
  is_recurring: boolean;
  recurrence_pattern?: RecurringEventPattern;
  recurrence_end_date?: string;
  instances?: CalendarEventInstance[];
}
