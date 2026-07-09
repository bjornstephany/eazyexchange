export type Role = 'organizer' | 'student'
export type OrgRole = 'owner' | 'admin'
export type FormType = 'data_entry' | 'document_upload'
export type TemplateKind = 'online' | 'pdf' | 'doc'
export type TemplateStatus = 'draft' | 'active'
export type TemplateAudience = 'all' | 'conditional'
export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type FieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select'
export type ApplicationStatus =
  | 'draft' | 'submitted' | 'rejected' | 'accepted' | 'declined' | 'maybe' | 'enrolling' | 'enrolled'

export type SubscriptionStatus =
  | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete'

export type School = {
  id: string
  name: string
  created_at: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: SubscriptionStatus | null
  plan: 'starter' | 'growth' | 'scale' | null
  current_period_end: string | null
  grace_until: string | null
}
export type Exchange = {
  id: string; name: string; year: number
  school_a_id: string; school_b_id: string | null; created_at: string
  application_open: boolean
  application_deadline: string | null
  apply_slug: string | null
  phase: number
  phase2_checklist_sent_at: string | null
  archived_at: string | null
  reminders_enabled: boolean
  reminder_cadence: string
}
export type UserProfile = {
  id: string; school_id: string; role: Role
  full_name: string; email: string; created_at: string
  org_role: OrgRole
}
export type ExchangeEnrollment = { id: string; exchange_id: string; user_id: string; created_at: string }
export type FormTemplate = {
  id: string; exchange_id: string; school_id: string
  name: string; description: string | null; type: FormType
  deadline: string | null; created_by: string; created_at: string
  kind: TemplateKind; status: TemplateStatus; audience: TemplateAudience
  standard_key: string | null; condition_label: string | null
  template_file_path: string | null
}
export type FormField = {
  id: string; template_id: string; label: string
  field_type: FieldType; options: string[] | null
  required: boolean; order: number
}
export type DocumentSlot = {
  id: string; template_id: string; label: string
  description: string | null; required: boolean; order: number
}
export type Assignment = {
  id: string; template_id: string; student_id: string; assigned_at: string
  last_reminded_at?: string | null
}
export type Submission = {
  id: string; assignment_id: string; status: SubmissionStatus
  submitted_at: string | null; reviewed_at: string | null
  reviewer_id: string | null; review_note: string | null
  created_at: string; updated_at: string
}
export type FieldAnswer = { id: string; submission_id: string; field_id: string; value: string }
export type DocumentUpload = {
  id: string; submission_id: string; slot_id: string
  storage_path: string; file_name: string; uploaded_at: string
}
export type Application = {
  id: string; exchange_id: string; school_id: string
  email: string; resume_token: string; invite_token: string | null
  resume_token_expires_at: string | null; invite_token_expires_at: string | null
  status: ApplicationStatus
  data: Record<string, string>
  photo_path: string | null; language: 'en' | 'fr'
  invite_response: 'yes' | 'no' | 'maybe' | null
  invite_response_note: string | null; responded_at: string | null
  enrolled_user_id: string | null
  submitted_at: string | null; reviewed_at: string | null
  reviewer_id: string | null; review_note: string | null
  created_at: string; updated_at: string
  terms_acknowledged_at?: string | null
}
export type OrganizerInvite = {
  id: string; school_id: string; email: string; token: string
  invited_by: string | null; created_at: string; expires_at: string
  accepted_at: string | null; revoked_at: string | null
}
export type RateLimit = { key: string; hits: number; window_start: string }
export type Feedback = {
  id: string; user_id: string; school_id: string
  type: 'suggestion' | 'bug'; message: string; page_path: string | null
  status: 'new' | 'reviewed' | 'done'; created_at: string
}
export type EmailSendStatus = 'sent' | 'error'
export type EmailSendLog = {
  id: string
  created_at: string
  recipient: string
  kind: string
  status: EmailSendStatus
  error_code: number | null
  school_id: string | null
  exchange_id: string | null
}
export type AuditLog = {
  id: string
  actor_user_id: string | null
  actor_school_id: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, string | number | boolean | null>
  created_at: string
}

type TableDef<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      schools: TableDef<School, Pick<School, 'name'> & Partial<Omit<School, 'id' | 'created_at' | 'name'>>, Partial<School>>
      exchanges: TableDef<Exchange, Omit<Exchange, 'id' | 'created_at' | 'application_open' | 'application_deadline' | 'apply_slug' | 'phase' | 'phase2_checklist_sent_at' | 'archived_at' | 'reminders_enabled' | 'reminder_cadence'> & Partial<Pick<Exchange, 'application_open' | 'application_deadline' | 'apply_slug' | 'phase' | 'phase2_checklist_sent_at' | 'archived_at' | 'reminders_enabled' | 'reminder_cadence'>>, Partial<Exchange>>
      users: TableDef<
        UserProfile,
        Omit<UserProfile, 'created_at' | 'org_role'> &
          Partial<Pick<UserProfile, 'org_role'>>,
        Partial<UserProfile>
      >
      organizer_invites: TableDef<
        OrganizerInvite,
        Omit<OrganizerInvite, 'id' | 'created_at' | 'expires_at' | 'accepted_at' | 'revoked_at'> &
          Partial<Pick<OrganizerInvite, 'expires_at'>>,
        Partial<OrganizerInvite>
      >
      exchange_enrollments: TableDef<ExchangeEnrollment, Omit<ExchangeEnrollment, 'id' | 'created_at'>, Partial<ExchangeEnrollment>>
      form_templates: TableDef<FormTemplate, Omit<FormTemplate, 'id' | 'created_at' | 'deadline' | 'standard_key' | 'condition_label' | 'template_file_path'> & Partial<Pick<FormTemplate, 'deadline' | 'standard_key' | 'condition_label' | 'template_file_path'>>, Partial<FormTemplate>>
      form_fields: TableDef<FormField, Omit<FormField, 'id'>, Partial<FormField>>
      document_slots: TableDef<DocumentSlot, Omit<DocumentSlot, 'id'>, Partial<DocumentSlot>>
      assignments: TableDef<Assignment, Omit<Assignment, 'id' | 'assigned_at'>, Partial<Assignment>>
      submissions: TableDef<Submission, Omit<Submission, 'id' | 'created_at' | 'updated_at'>, Partial<Submission>>
      field_answers: TableDef<FieldAnswer, Omit<FieldAnswer, 'id'>, Partial<FieldAnswer>>
      document_uploads: TableDef<DocumentUpload, Omit<DocumentUpload, 'id' | 'uploaded_at'>, Partial<DocumentUpload>>
      applications: TableDef<Application, Omit<Application, 'id' | 'created_at' | 'updated_at'>, Partial<Application>>
      feedback: TableDef<Feedback, Omit<Feedback, 'id' | 'status' | 'created_at'> & Partial<Pick<Feedback, 'status'>>, Partial<Feedback>>
      email_send_log: TableDef<
        EmailSendLog,
        Omit<EmailSendLog, 'id' | 'created_at' | 'error_code' | 'school_id' | 'exchange_id'> &
          Partial<Pick<EmailSendLog, 'error_code' | 'school_id' | 'exchange_id'>>,
        Partial<EmailSendLog>
      >
      rate_limits: TableDef<RateLimit, RateLimit, Partial<RateLimit>>
      audit_log: TableDef<
        AuditLog,
        Omit<AuditLog, 'id' | 'created_at' | 'metadata'> & Partial<Pick<AuditLog, 'metadata'>>,
        Record<string, never> // append-only: .update() is a type error in practice
      >
    }
    Views: Record<string, never>
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      get_apply_page_exchange: {
        Args: { p_slug: string }
        Returns: { name: string; application_open: boolean; application_deadline: string | null }[]
      }
      peek_application_draft: {
        Args: { p_token: string }
        Returns: {
          status: string
          first_name: string | null
          language: string
          resume_token_expires_at: string | null
        }[]
      }
    }
  }
}
