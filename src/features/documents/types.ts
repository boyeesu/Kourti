export interface DocTemplate {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  content: string;
  variables: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratedDoc {
  id: string; // document id returned after generation
  storage_path: string;
}
