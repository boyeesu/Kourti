export interface CommunicationLog {
  id: string;
  client_id: string;
  user_id: string;
  type: 'email' | 'phone' | 'note';
  content: string;
  created_at: string;
}
