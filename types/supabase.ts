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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      applications: {
        Row: {
          created_at: string
          data: Json
          email: string
          enrolled_user_id: string | null
          exchange_id: string
          id: string
          invite_response: string | null
          invite_response_note: string | null
          invite_token: string | null
          invite_token_expires_at: string | null
          invited_at: string | null
          language: string
          photo_path: string | null
          responded_at: string | null
          resume_token: string
          resume_token_expires_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          school_id: string
          status: string
          submitted_at: string | null
          terms_acknowledged_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          email: string
          enrolled_user_id?: string | null
          exchange_id: string
          id?: string
          invite_response?: string | null
          invite_response_note?: string | null
          invite_token?: string | null
          invite_token_expires_at?: string | null
          invited_at?: string | null
          language?: string
          photo_path?: string | null
          responded_at?: string | null
          resume_token: string
          resume_token_expires_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_id: string
          status?: string
          submitted_at?: string | null
          terms_acknowledged_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          email?: string
          enrolled_user_id?: string | null
          exchange_id?: string
          id?: string
          invite_response?: string | null
          invite_response_note?: string | null
          invite_token?: string | null
          invite_token_expires_at?: string | null
          invited_at?: string | null
          language?: string
          photo_path?: string | null
          responded_at?: string | null
          resume_token?: string
          resume_token_expires_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_id?: string
          status?: string
          submitted_at?: string | null
          terms_acknowledged_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_enrolled_user_id_fkey"
            columns: ["enrolled_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_at: string
          id: string
          last_reminded_at: string | null
          student_id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          last_reminded_at?: string | null
          student_id: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          last_reminded_at?: string | null
          student_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_school_id: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_school_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_school_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      document_slots: {
        Row: {
          description: string | null
          id: string
          label: string
          order: number
          required: boolean
          template_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          label: string
          order?: number
          required?: boolean
          template_id: string
        }
        Update: {
          description?: string | null
          id?: string
          label?: string
          order?: number
          required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_uploads: {
        Row: {
          file_name: string
          id: string
          slot_id: string
          storage_path: string
          submission_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          id?: string
          slot_id: string
          storage_path: string
          submission_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          id?: string
          slot_id?: string
          storage_path?: string
          submission_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_uploads_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "document_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_uploads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_code: number | null
          exchange_id: string | null
          id: string
          kind: string
          recipient: string
          school_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_code?: number | null
          exchange_id?: string | null
          id?: string
          kind: string
          recipient: string
          school_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error_code?: number | null
          exchange_id?: string | null
          id?: string
          kind?: string
          recipient?: string
          school_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          digest: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          message: string
          method: string
          occurrences: number
          route_path: string
          stack: string | null
          status: string
        }
        Insert: {
          digest?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message: string
          method: string
          occurrences?: number
          route_path: string
          stack?: string | null
          status?: string
        }
        Update: {
          digest?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message?: string
          method?: string
          occurrences?: number
          route_path?: string
          stack?: string | null
          status?: string
        }
        Relationships: []
      }
      exchange_enrollments: {
        Row: {
          created_at: string
          exchange_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exchange_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exchange_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_enrollments_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_info_cards: {
        Row: {
          body: string
          created_at: string
          exchange_id: string
          id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          exchange_id: string
          id?: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          exchange_id?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_info_cards_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_program_details: {
        Row: {
          absence_dates: string[]
          association_name: string | null
          chaperones: string[]
          destination: string | null
          exchange_id: string
          proviseur_name: string | null
          receiving_school_name: string | null
          sending_city: string | null
          sending_school_name: string | null
          travel_end: string | null
          travel_start: string | null
          updated_at: string
        }
        Insert: {
          absence_dates?: string[]
          association_name?: string | null
          chaperones?: string[]
          destination?: string | null
          exchange_id: string
          proviseur_name?: string | null
          receiving_school_name?: string | null
          sending_city?: string | null
          sending_school_name?: string | null
          travel_end?: string | null
          travel_start?: string | null
          updated_at?: string
        }
        Update: {
          absence_dates?: string[]
          association_name?: string | null
          chaperones?: string[]
          destination?: string | null
          exchange_id?: string
          proviseur_name?: string | null
          receiving_school_name?: string | null
          sending_city?: string | null
          sending_school_name?: string | null
          travel_end?: string | null
          travel_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_program_details_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: true
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
        ]
      }
      exchanges: {
        Row: {
          application_deadline: string | null
          application_open: boolean
          apply_slug: string | null
          archived_at: string | null
          created_at: string
          good_news_body: string | null
          good_news_subject: string | null
          id: string
          name: string
          phase: number
          phase2_checklist_sent_at: string | null
          reminder_cadence: string
          reminders_enabled: boolean
          school_a_id: string
          school_b_id: string | null
          year: number
        }
        Insert: {
          application_deadline?: string | null
          application_open?: boolean
          apply_slug?: string | null
          archived_at?: string | null
          created_at?: string
          good_news_body?: string | null
          good_news_subject?: string | null
          id?: string
          name: string
          phase?: number
          phase2_checklist_sent_at?: string | null
          reminder_cadence?: string
          reminders_enabled?: boolean
          school_a_id: string
          school_b_id?: string | null
          year: number
        }
        Update: {
          application_deadline?: string | null
          application_open?: boolean
          apply_slug?: string | null
          archived_at?: string | null
          created_at?: string
          good_news_body?: string | null
          good_news_subject?: string | null
          id?: string
          name?: string
          phase?: number
          phase2_checklist_sent_at?: string | null
          reminder_cadence?: string
          reminders_enabled?: boolean
          school_a_id?: string
          school_b_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "exchanges_school_a_id_fkey"
            columns: ["school_a_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchanges_school_b_id_fkey"
            columns: ["school_b_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          page_path: string | null
          school_id: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page_path?: string | null
          school_id: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page_path?: string | null
          school_id?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_answers: {
        Row: {
          field_id: string
          id: string
          submission_id: string
          value: string
        }
        Insert: {
          field_id: string
          id?: string
          submission_id: string
          value: string
        }
        Update: {
          field_id?: string
          id?: string
          submission_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          field_type: string
          id: string
          label: string
          options: Json | null
          order: number
          required: boolean
          template_id: string
        }
        Insert: {
          field_type: string
          id?: string
          label: string
          options?: Json | null
          order?: number
          required?: boolean
          template_id: string
        }
        Update: {
          field_type?: string
          id?: string
          label?: string
          options?: Json | null
          order?: number
          required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          audience: string
          condition_label: string | null
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          exchange_id: string
          external_url: string | null
          id: string
          kind: string
          name: string
          school_id: string
          standard_key: string | null
          status: string
          template_file_path: string | null
          type: string
        }
        Insert: {
          audience?: string
          condition_label?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          exchange_id: string
          external_url?: string | null
          id?: string
          kind?: string
          name: string
          school_id: string
          standard_key?: string | null
          status?: string
          template_file_path?: string | null
          type: string
        }
        Update: {
          audience?: string
          condition_label?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          exchange_id?: string
          external_url?: string | null
          id?: string
          kind?: string
          name?: string
          school_id?: string
          standard_key?: string | null
          status?: string
          template_file_path?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          school_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          school_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          school_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_invites_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      school_registry: {
        Row: {
          academy: string | null
          commune: string
          department: string | null
          id: number
          name: string
          postal_code: string
          search_name: string
          search_text: string
          status: string | null
          type: string
          uai: string
        }
        Insert: {
          academy?: string | null
          commune: string
          department?: string | null
          id?: number
          name: string
          postal_code: string
          search_name: string
          search_text: string
          status?: string | null
          type: string
          uai: string
        }
        Update: {
          academy?: string | null
          commune?: string
          department?: string | null
          id?: number
          name?: string
          postal_code?: string
          search_name?: string
          search_text?: string
          status?: string | null
          type?: string
          uai?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          country: string
          created_at: string
          current_period_end: string | null
          grace_until: string | null
          id: string
          name: string
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          uai: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          name: string
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          uai?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          name?: string
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          uai?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string
          created_at: string
          fillable_data: Json | null
          generated_pdf_path: string | null
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          fillable_data?: Json | null
          generated_pdf_path?: string | null
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          fillable_data?: Json | null
          generated_pdf_path?: string | null
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          exchange_order: string[]
          full_name: string
          id: string
          locale: string
          org_role: string
          role: string
          school_id: string
        }
        Insert: {
          created_at?: string
          email: string
          exchange_order?: string[]
          full_name: string
          id: string
          locale?: string
          org_role?: string
          role: string
          school_id: string
        }
        Update: {
          created_at?: string
          email?: string
          exchange_order?: string[]
          full_name?: string
          id?: string
          locale?: string
          org_role?: string
          role?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assignment_school: { Args: { aid: string }; Returns: string }
      assignment_student: { Args: { aid: string }; Returns: string }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_school: {
        Args: { p_country: string; p_name: string; p_uai: string }
        Returns: string
      }
      exchange_in_my_school: { Args: { eid: string }; Returns: boolean }
      field_template: { Args: { fid: string }; Returns: string }
      get_apply_page_exchange: {
        Args: { p_slug: string }
        Returns: {
          application_deadline: string
          application_open: boolean
          name: string
        }[]
      }
      has_assignment: { Args: { tid: string }; Returns: boolean }
      my_role: { Args: never; Returns: string }
      my_school_id: { Args: never; Returns: string }
      peek_application_draft: {
        Args: { p_token: string }
        Returns: {
          first_name: string
          language: string
          resume_token_expires_at: string
          status: string
        }[]
      }
      record_error_report: {
        Args: {
          p_digest?: string
          p_fingerprint: string
          p_message: string
          p_method: string
          p_route_path: string
          p_stack?: string
        }
        Returns: undefined
      }
      school_paired_with_mine: {
        Args: { p_school_id: string }
        Returns: boolean
      }
      slot_template: { Args: { sid: string }; Returns: string }
      submission_school: { Args: { sid: string }; Returns: string }
      submission_student: { Args: { sid: string }; Returns: string }
      submission_template: { Args: { subid: string }; Returns: string }
      template_school: { Args: { tid: string }; Returns: string }
      user_in_my_school: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
