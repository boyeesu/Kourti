export interface CaseType {
  id: string;
  organization_id: string | null; // Made nullable for global case types
  name: string;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  is_active?: boolean | null;
  is_global?: boolean | null; // Added for global case types
}

export interface CaseIssue {
  id: string;
  case_type_id: string;
  name: string;
  description?: string | null;
  organization_id: string | null; // Made nullable for global case issues
  created_at: string;
  updated_at: string;
  is_global?: boolean | null; // Added for global case issues
}

export interface CaseField {
  id: string;
  case_type_id: string;
  label: string;
  field_key: string;
  data_type: string;
  is_required: boolean | null;
  options?: any;
  field_order: number | null;
  organization_id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}