

export interface Case {
  id: string;
  organization_id: string;
  client_id?: string;
  title: string;
  description?: string;
  case_number?: string;
  status: string;
  priority: string;
  assigned_to?: string;
  court?: string;
  next_hearing_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    name: string;
  };
  assigned_user?: {
    id: string;
    first_name?: string;
    last_name?: string;
  } | null;
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  notes?: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  cases?: { count: number }[];
  contracts?: { count: number }[];
}

export interface Contract {
  id: string;
  organization_id: string;
  client_id?: string;
  title: string;
  description?: string;
  contract_type?: string;
  status: string;
  value?: number;
  currency: string;
  start_date?: string;
  end_date?: string;
  terms?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  organization_id: string;
  case_id?: string;
  client_id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  attendees?: string[];
  event_type: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CommunicationLog {
  id: string;
  client_id: string;
  user_id: string;
  type: 'email' | 'phone' | 'note';
  content: string;
  created_at: string;
}

export interface Document {
  id: string;
  organization_id: string;
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
  created_at: string;
  updated_at: string;
}

