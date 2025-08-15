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
  client?: Client;
  documents?: Document[];
  tasks?: Task[];
  events?: CalendarEvent[];
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
  type: 'call' | 'email' | 'meeting' | 'other';
  subject?: string;
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

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  event_type: 'meeting' | 'hearing' | 'deadline' | 'deposition' | 'review' | 'consultation';
  case_id?: string;
  client_id?: string;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attendees?: string[];
}

export interface Document {
  id: string;
  name: string;
  content: string;
  summary?: string;
  metadata?: any;
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
  metadata?: any;
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