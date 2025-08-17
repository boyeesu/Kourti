export interface CaseType {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
}

export interface CaseIssue {
  id: string;
  case_type_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CaseField {
  id: string;
  case_type_id: string;
  label: string;
  field_key: string;
  data_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: {
    choices: string[];
  };
  field_order: number;
  created_at: string;
}