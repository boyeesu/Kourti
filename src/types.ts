export interface Case {
  /**
   * Aggregated count when fetched with Supabase `select('count')`.
   * Optional so it does not impact normal case records.
   */
  count?: number;
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  title: string;
  description?: string;
  status: 'open' | 'closed' | 'pending';
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
  client_id?: string;
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
  documents?: Document[];
}

export interface CalendarEvent {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  attendees?: string[];
  event_type: 'meeting' | 'hearing' | 'deadline' | 'deposition' | 'review' | 'consultation';
  case_id?: string;
  client_id?: string;
}

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  title: string;
  description?: string;
  due_date?: string;
  status: 'open' | 'completed' | 'pending';
  priority?: 'high' | 'medium' | 'low';
  case_id?: string;
  client_id?: string;
  assigned_to?: string;
}

export interface Document {
  id: string;
  title: string;
  name: string;
  file_path: string;
  file_url?: string;
  file_type?: string;
  file_size?: number;
  case_id?: string;
  client_id?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  size?: number;
  content_type?: string;
  status: 'active' | 'archived' | 'pending';
  tags?: string[];
  version?: number;
}

export interface Invoice {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  client_id: string;
  case_id?: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  notes?: string;
  line_items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  created_at: string;
  updated_at: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Contract {
  /** Supabase aggregate count helper */
  count?: number;

  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  value: number;
  currency?: string;
  status: 'active' | 'expired' | 'terminated';
  client_id?: string;
  case_id?: string;
  terms?: string;
}

export interface Organization {
  id: string;
  name: string;
  email?: string;
  industry?: string;
  created_at: string;
  updated_at: string;
  settings?: Record<string, any>;
}

export interface User {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  role: 'admin' | 'user';
  organization_id: string;
  profile?: Profile;
}

export interface Profile {
  id: any;
  user_id: any;
  first_name: any;
  last_name: any;
  email: any;
  phone: any;
  department: any;
  role: any;
  title?: string;
  avatar_url: any;
  created_at: any;
  updated_at: any;
}

export interface CommunicationLog {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  user_id?: string;
  organization_id: string;
  client_id: string;
  case_id?: string;
  type: 'email' | 'phone' | 'meeting' | 'letter' | 'note';
  subject?: string;
  content: string;
  date: string;
  notes?: string;
}
