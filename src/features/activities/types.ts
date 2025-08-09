export interface CaseActivity {
  id: string;
  case_id: string;
  title: string;
  description?: string;
  activity_type: string; // Meeting, Court, Research, etc.
  assigned_to?: string | null;
  due_date?: string | null; // ISO date
  status: string; // pending | in_progress | completed
  created_at: string;
  created_by?: string | null;
}

export interface TimeEntry {
  id: string;
  activity_id: string;
  user_id: string;
  minutes: number;
  notes?: string;
  created_at: string;
}
