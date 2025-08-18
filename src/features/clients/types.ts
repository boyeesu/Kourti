export interface CommunicationLog {
  id: string;
  client_id: string;
  user_id: string;
  type: string;
  content: string;
  created_at: string | null;
  organization_id: string;
}
