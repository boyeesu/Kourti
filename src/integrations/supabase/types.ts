export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      ai_conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      best_practices: {
        Row: {
          clause: string
          embedding: string
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          clause: string
          embedding: string
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          clause?: string
          embedding?: string
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "best_practices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees: string[] | null
          case_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          event_type: string | null
          id: string
          location: string | null
          organization_id: string | null
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: string[] | null
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          event_type?: string | null
          id?: string
          location?: string | null
          organization_id?: string | null
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: string[] | null
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          event_type?: string | null
          id?: string
          location?: string | null
          organization_id?: string | null
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_calendar_events_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      case_activities: {
        Row: {
          activity_type: string
          assigned_to: string | null
          case_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          status: string | null
          title: string
        }
        Insert: {
          activity_type: string
          assigned_to?: string | null
          case_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          status?: string | null
          title: string
        }
        Update: {
          activity_type?: string
          assigned_to?: string | null
          case_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_activities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_case_activities_assigned_to_profile"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_case_activities_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_case_activities_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_fields: {
        Row: {
          case_type_id: string
          created_at: string
          created_by: string | null
          data_type: string
          field_key: string
          field_order: number | null
          id: string
          is_required: boolean | null
          label: string
          options: Json | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          case_type_id: string
          created_at?: string
          created_by?: string | null
          data_type?: string
          field_key: string
          field_order?: number | null
          id?: string
          is_required?: boolean | null
          label: string
          options?: Json | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          case_type_id?: string
          created_at?: string
          created_by?: string | null
          data_type?: string
          field_key?: string
          field_order?: number | null
          id?: string
          is_required?: boolean | null
          label?: string
          options?: Json | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_fields_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_case_fields_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_issues: {
        Row: {
          case_type_id: string
          created_at: string
          description: string | null
          id: string
          is_global: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          case_type_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          case_type_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_issues_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_case_issues_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_case_types_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_to: string | null
          case_issue_id: string | null
          case_number: string | null
          case_type_description: string | null
          case_type_id: string | null
          case_type_name: string | null
          client_id: string | null
          court: string | null
          created_at: string
          created_by: string | null
          current_status: string | null
          custom_fields: Json | null
          description: string | null
          id: string
          next_hearing_date: string | null
          organization_id: string | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          case_issue_id?: string | null
          case_number?: string | null
          case_type_description?: string | null
          case_type_id?: string | null
          case_type_name?: string | null
          client_id?: string | null
          court?: string | null
          created_at?: string
          created_by?: string | null
          current_status?: string | null
          custom_fields?: Json | null
          description?: string | null
          id?: string
          next_hearing_date?: string | null
          organization_id?: string | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          case_issue_id?: string | null
          case_number?: string | null
          case_type_description?: string | null
          case_type_id?: string | null
          case_type_name?: string | null
          client_id?: string | null
          court?: string | null
          created_at?: string
          created_by?: string | null
          current_status?: string | null
          custom_fields?: Json | null
          description?: string | null
          id?: string
          next_hearing_date?: string | null
          organization_id?: string | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_issue_id_fkey"
            columns: ["case_issue_id"]
            isOneToOne: false
            referencedRelation: "case_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cases_assigned_to_profile"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_cases_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clients_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          client_id: string
          content: string
          created_at: string | null
          id: string
          organization_id: string
          type: string
          user_id: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string | null
          id?: string
          organization_id: string
          type: string
          user_id: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_communication_logs_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_communication_logs_user_profile"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          contract_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          organization_id: string | null
          template_content: string
          updated_at: string | null
        }
        Insert: {
          contract_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          organization_id?: string | null
          template_content: string
          updated_at?: string | null
        }
        Update: {
          contract_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          organization_id?: string | null
          template_content?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_templates_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string | null
          contract_type: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          embedding: string | null
          end_date: string | null
          id: string
          organization_id: string | null
          start_date: string | null
          status: string | null
          terms: string | null
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          client_id?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          embedding?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string | null
          start_date?: string | null
          status?: string | null
          terms?: string | null
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          client_id?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          embedding?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string | null
          start_date?: string | null
          status?: string | null
          terms?: string | null
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contracts_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contracts_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dashboard_prefs: {
        Row: {
          id: string
          organization_id: string
          reminder_window_days: number | null
          show_upcoming_cases: boolean | null
          show_upcoming_contracts: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          reminder_window_days?: number | null
          show_upcoming_cases?: boolean | null
          show_upcoming_contracts?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          reminder_window_days?: number | null
          show_upcoming_cases?: boolean | null
          show_upcoming_contracts?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_prefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_templates: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "doc_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analyses: {
        Row: {
          analysis_type: string
          content: string
          created_at: string
          created_by: string
          document_id: string
          embedding: string | null
          error: string | null
          id: string
          metadata: Json | null
          organization_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          analysis_type: string
          content: string
          created_at?: string
          created_by: string
          document_id: string
          embedding?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          analysis_type?: string
          content?: string
          created_at?: string
          created_by?: string
          document_id?: string
          embedding?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_document_analyses_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          contract_id: string | null
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          chunk_index: number
          content: string
          contract_id?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          contract_id?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_document_chunks_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string | null
          content: string
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          effective_date: string | null
          embedding: string | null
          file_path: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          mime_type: string | null
          name: string
          organization_id: string | null
          renewal_date: string | null
          summary: string | null
          termination_date: string | null
          terms: string | null
          updated_at: string | null
          value: number | null
        }
        Insert: {
          client_id?: string | null
          content: string
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          effective_date?: string | null
          embedding?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          name: string
          organization_id?: string | null
          renewal_date?: string | null
          summary?: string | null
          termination_date?: string | null
          terms?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          client_id?: string | null
          content?: string
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          effective_date?: string | null
          embedding?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          name?: string
          organization_id?: string | null
          renewal_date?: string | null
          summary?: string | null
          termination_date?: string | null
          terms?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documents_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      global_roles: {
        Row: {
          description: string | null
          display_name: string
          role: string
        }
        Insert: {
          description?: string | null
          display_name: string
          role: string
        }
        Update: {
          description?: string | null
          display_name?: string
          role?: string
        }
        Relationships: []
      }
      invitation_custom_roles: {
        Row: {
          created_at: string | null
          id: string
          invitation_id: string
          role_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invitation_id: string
          role_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invitation_id?: string
          role_name?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string
          department: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string
          last_name: string | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by: string
          last_name?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string
          last_name?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          organization_id: string
          quantity: number
          rate: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          organization_id: string
          quantity?: number
          rate?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          organization_id?: string
          quantity?: number
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoice_items_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_notes: string | null
          default_tax_rate: number | null
          default_terms: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_notes?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_notes?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          case_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          organization_id: string
          status: string | null
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          terms_conditions: string | null
          title: string
          total: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount?: number
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          organization_id: string
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          terms_conditions?: string | null
          title: string
          total?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          terms_conditions?: string | null
          title?: string
          total?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          organization_id: string | null
          status: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          status?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          status?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_usage: {
        Row: {
          analysis_type: string | null
          completion_tokens: number | null
          created_at: string | null
          id: number
          model: string | null
          prompt_tokens: number | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          analysis_type?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          id?: number
          model?: string | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          analysis_type?: string | null
          completion_tokens?: number | null
          created_at?: string | null
          id?: number
          model?: string | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      organization_sso_configs: {
        Row: {
          client_id: string
          client_secret: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          domain_hint: string | null
          id: string
          is_enabled: boolean
          metadata_url: string | null
          organization_id: string
          provider: string
          redirect_uri: string | null
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          client_secret?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          domain_hint?: string | null
          id?: string
          is_enabled?: boolean
          metadata_url?: string | null
          organization_id: string
          provider: string
          redirect_uri?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          domain_hint?: string | null
          id?: string
          is_enabled?: boolean
          metadata_url?: string | null
          organization_id?: string
          provider?: string
          redirect_uri?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_sso_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_sso_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          country: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          disabled_at: string | null
          disabled_by: string | null
          email: string | null
          first_name: string | null
          id: string
          is_organization_creator: boolean | null
          last_login_at: string | null
          last_name: string | null
          organization_id: string
          password_reset_required: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          role_id: string | null
          settings: Json | null
          status: string | null
          title: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_organization_creator?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          organization_id: string
          password_reset_required?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id?: string | null
          settings?: Json | null
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_organization_creator?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          organization_id?: string
          password_reset_required?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id?: string | null
          settings?: Json | null
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: string
          created_at: string
          created_by: string
          granted: boolean
          id: string
          organization_id: string
          resource: string
          role_name: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          granted?: boolean
          id?: string
          organization_id: string
          resource: string
          role_name: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          granted?: boolean
          id?: string
          organization_id?: string
          resource?: string
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          key: string
          organization_id: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          case_id: string | null
          completed: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          task_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          case_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          task_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          case_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tasks_assigned_to_profile"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_tasks_created_by_profile"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_id: string
          created_at: string | null
          id: string
          minutes: number
          notes: string | null
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          id?: string
          minutes: number
          notes?: string | null
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          id?: string
          minutes?: number
          notes?: string | null
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_entries_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "case_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          count: number
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          assigned_by: string
          created_at: string | null
          id: string
          organization_id: string
          role_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string | null
          id?: string
          organization_id: string
          role_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          role_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_role_assignments_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          organization_id: string
          permissions: Json | null
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          organization_id: string
          permissions?: Json | null
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          organization_id?: string
          permissions?: Json | null
          role_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voice_transcriptions: {
        Row: {
          audio_file_path: string | null
          audio_file_url: string | null
          case_id: string | null
          created_at: string
          created_by: string
          duration_seconds: number | null
          id: string
          metadata: Json | null
          organization_id: string
          status: string | null
          summary: string | null
          title: string
          transcript: string
          updated_at: string
        }
        Insert: {
          audio_file_path?: string | null
          audio_file_url?: string | null
          case_id?: string | null
          created_at?: string
          created_by: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          organization_id: string
          status?: string | null
          summary?: string | null
          title: string
          transcript: string
          updated_at?: string
        }
        Update: {
          audio_file_path?: string | null
          audio_file_url?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          status?: string | null
          summary?: string | null
          title?: string
          transcript?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_voice_transcriptions_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      all_roles: {
        Row: {
          description: string | null
          display_name: string | null
          organization_id: string | null
          role_id: string | null
          role_name: string | null
          role_type: string | null
        }
        Relationships: []
      }
      organization_sso_configs_view: {
        Row: {
          client_id: string | null
          client_secret_masked: string | null
          created_at: string | null
          created_by: string | null
          domain_hint: string | null
          has_client_secret: boolean | null
          id: string | null
          is_enabled: boolean | null
          organization_id: string | null
          provider: string | null
          redirect_uri: string | null
          tenant_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret_masked?: never
          created_at?: string | null
          created_by?: string | null
          domain_hint?: string | null
          has_client_secret?: never
          id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          provider?: string | null
          redirect_uri?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret_masked?: never
          created_at?: string | null
          created_by?: string | null
          domain_hint?: string | null
          has_client_secret?: never
          id?: string | null
          is_enabled?: boolean | null
          organization_id?: string | null
          provider?: string | null
          redirect_uri?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_sso_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_sso_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation_and_assign_roles: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: Json
      }
      analyze_document: {
        Args: {
          p_analysis_type?: string
          p_content: string
          p_document_id: string
          p_document_type?: string
        }
        Returns: Json
      }
      change_user_role: {
        Args: { p_new_role_name: string; p_target_user_id: string }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_description: string
          p_organization_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      current_user_is_org_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      delete_organization_sso_config: {
        Args: { p_id: string }
        Returns: boolean
      }
      disable_user: {
        Args: { target_user_id: string }
        Returns: Json
      }
      enable_user: {
        Args: { target_user_id: string }
        Returns: Json
      }
      generate_invoice_number: {
        Args: { org_id: string }
        Returns: string
      }
      get_current_user_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_document_analysis: {
        Args: { p_analysis_type?: string; p_document_id: string }
        Returns: {
          content: string
          created_at: string
          error: string
          id: string
          status: string
        }[]
      }
      get_organization_roles: {
        Args: { p_organization_id: string }
        Returns: {
          description: string
          display_name: string
          organization_id: string
          role_name: string
          role_type: string
        }[]
      }
      get_organization_users: {
        Args: { org_id: string }
        Returns: {
          created_at: string
          department: string
          disabled_at: string
          disabled_by: string
          email: string
          first_name: string
          id: string
          last_login_at: string
          last_name: string
          organization_id: string
          role: string
          status: string
          user_id: string
          user_type: string
          verification_status: string
          verified_at: string
        }[]
      }
      get_user_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      initialize_custom_role_permissions: {
        Args: {
          p_created_by: string
          p_organization_id: string
          p_role_name: string
        }
        Returns: undefined
      }
      invite_user_to_organization: {
        Args: {
          p_department?: string
          p_email: string
          p_first_name: string
          p_last_name: string
          p_role: string
        }
        Returns: Json
      }
      is_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_new_values?: Json
          p_old_values?: Json
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: string
      }
      match_best_practices: {
        Args: { query: string }
        Returns: {
          clause: string
          id: string
          similarity: number
        }[]
      }
      match_contracts: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          terms: string
          title: string
        }[]
      }
      match_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          name: string
          similarity: number
          summary: string
        }[]
      }
      safe_delete_custom_role: {
        Args: { p_organization_id: string; p_role_name: string }
        Returns: Json
      }
      toggle_user_status: {
        Args: { disable?: boolean; target_user_id: string }
        Returns: Json
      }
      upsert_organization_sso_config: {
        Args: {
          p_client_id?: string
          p_client_secret?: string
          p_domain_hint?: string
          p_id?: string
          p_is_enabled?: boolean
          p_provider?: string
          p_redirect_uri?: string
          p_tenant_id?: string
        }
        Returns: {
          client_id: string
          client_secret: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          domain_hint: string | null
          id: string
          is_enabled: boolean
          metadata_url: string | null
          organization_id: string
          provider: string
          redirect_uri: string | null
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
      }
      user_has_permission: {
        Args: { p_action: string; p_resource: string; p_user_id: string }
        Returns: boolean
      }
      user_has_specific_permission: {
        Args: { p_action: string; p_resource: string; p_user_id: string }
        Returns: boolean
      }
      validate_role_exists: {
        Args: { p_organization_id: string; p_role_name: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role:
        | "superadmin"
        | "admin"
        | "user"
        | "finance"
        | "administrator"
        | "legal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: [
        "superadmin",
        "admin",
        "user",
        "finance",
        "administrator",
        "legal",
      ],
    },
  },
} as const
