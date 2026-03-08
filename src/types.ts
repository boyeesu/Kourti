export interface Case {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  title: string;
  description?: string;
  client_id?: string;
  status: 'open' | 'in_progress' | 'closed' | 'pending';
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  case_number?: string;
  court?: string;
  judge?: string;
  opposing_counsel?: string;
  next_hearing_date?: string;
  trial_date?: string;
  resolution_date?: string;
  notes?: string;
  case_type_id?: string;
  case_issue_id?: string;
  custom_fields?: Record<string, unknown>;
  client?: Client;
  case_type?: {
    id: string;
    name: string;
    description?: string;
  };
  case_issue?: {
    id: string;
    case_type_id: string;
    name: string;
    description?: string;
  };
  documents?: Document[];
  tasks?: Task[];
  events?: CalendarEvent[];
  /**
   * Convenience property that may be included by API calls that aggregate the
   * number of related entities (e.g. total cases for a client). Optional so it
   * does not affect regular CRUD operations.
   */
  count?: number;
  assigned_to?: string | null;
  assigned_user?: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface Organization {
  id: string;
  name: string;
  industry?: string;
  created_at: string;
  updated_at: string;
}

export interface CommunicationLog {
  id: string;
  client_id: string;
  /**
   * The medium of communication. As the UI currently differentiates between
   * phone calls and general calls and supports note-only entries, we include
   * both here to avoid type-errors.
   */
  type: 'call' | 'phone' | 'email' | 'meeting' | 'note' | 'other';
  subject?: string;
  /**
   * Rich/free-text body of the log entry.
   */
  content?: string;
  /**
   * Short notes or summary – kept for backwards compatibility.
   */
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface Client {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  notes?: string;
  company?: string;
  status?: 'active' | 'inactive' | 'pending';
  cases?: Case[];
  contracts?: Contract[];
  count?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  due_date?: string;
  case_id?: string;
  client_id?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
}

export type { CalendarEventWithOwner } from '@/types/calendar-sharing';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  event_type: 'meeting' | 'hearing' | 'deadline' | 'deposition' | 'review' | 'consultation';
  case_id?: string | null;
  client_id?: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attendees?: string[] | null;
  reminder_date?: string;
  source?: 'internal' | 'google_calendar' | 'microsoft_teams';
  external_event_id?: string | null;
  external_source?: 'google_calendar' | 'microsoft_teams';
  external_calendar_id?: string | null;
}

export interface Document {
  id: string;
  /**
   * Human-readable title of the document (e.g. "NDA – ACME Corp").  This field
   * is accessed by several UI components and therefore provided in addition to
   * the legacy `name` property.
   */
  title?: string;
  /**
   * Original filename or stored path of the uploaded file.  This is required
   * by the e-sign workflow dialog.
   */
  file_path?: string;
  /**
   * Some components (e.g. list & preview) still rely on the `name` field.
   */
  name?: string;
  content?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  /**
   * Workflow/status tracking (e.g. draft → signed).  Optional to keep
   * backwards compatibility.
   */
  status?: 'draft' | 'pending' | 'signed' | 'review' | 'archived';
  effective_date?: string;
  renewal_date?: string;
  termination_date?: string;
  value?: number;
  contract_type?: string;
  currency?: string;
  terms?: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  case_id?: string;
  client_id?: string;
  /**
   * Optional case data attached to the document (fetched separately)
   */
  case?: { id: string; title: string } | null;
}

export interface Contract {
  id: string;
  title: string;
  description?: string;
  content?: string;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  start_date?: string;
  end_date?: string;
  value?: number;
  currency?: string;
  client_id?: string;
  case_id?: string;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  renewal_date?: string;
  termination_date?: string;
  contract_type?: string;
  terms?: string;
  metadata?: Record<string, unknown>;
  /**
   * Aggregated count convenience field (e.g. number of contracts for a client).
   */
  count?: number;
}

export interface ActivityLog {
  id: string;
  entity_type: 'case' | 'client' | 'document' | 'contract' | 'task';
  entity_id: string;
  action: 'created' | 'updated' | 'deleted' | 'viewed';
  details?: string;
  user_id: string;
  organization_id: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'lawyer' | 'paralegal' | 'client';
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  title?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  user_id: string;
  organization_id: string;
  created_at: string;
  entity_type?: string;
  entity_id?: string;
}

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalClients: number;
  upcomingDeadlines: number;
  recentActivities: ActivityLog[];
  upcomingEvents: CalendarEvent[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
