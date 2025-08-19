export interface CommunicationLog {
  id: string;
  client_id: string;
  user_id: string;
  type: 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other';
  content: string;
  created_at: string | null;
  organization_id: string;
}
