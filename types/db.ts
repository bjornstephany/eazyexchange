export type Role = 'organizer' | 'student'
export type FormType = 'data_entry' | 'document_upload'
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
  school_a_id: string; school_b_id: string; created_at: string
  application_open: boolean
  application_deadline: string | null
  apply_slug: string | null
  phase: number
}
export type UserProfile = {
  id: string; school_id: string; role: Role
  full_name: string; email: string; created_at: string
}
export type ExchangeEnrollment = { id: string; exchange_id: string; user_id: string; created_at: string }
export type FormTemplate = {
  id: string; exchange_id: string; school_id: string
  name: string; description: string | null; type: FormType
  deadline: string; created_by: string; created_at: string
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
export type Assignment = { id: string; template_id: string; student_id: string; assigned_at: string }
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
}
export type RateLimit = { key: string; hits: number; window_start: string }

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
      exchanges: TableDef<Exchange, Omit<Exchange, 'id' | 'created_at' | 'application_open' | 'application_deadline' | 'apply_slug' | 'phase'> & Partial<Pick<Exchange, 'application_open' | 'application_deadline' | 'apply_slug' | 'phase'>>, Partial<Exchange>>
      users: TableDef<UserProfile, Omit<UserProfile, 'created_at'>, Partial<UserProfile>>
      exchange_enrollments: TableDef<ExchangeEnrollment, Omit<ExchangeEnrollment, 'id' | 'created_at'>, Partial<ExchangeEnrollment>>
      form_templates: TableDef<FormTemplate, Omit<FormTemplate, 'id' | 'created_at'>, Partial<FormTemplate>>
      form_fields: TableDef<FormField, Omit<FormField, 'id'>, Partial<FormField>>
      document_slots: TableDef<DocumentSlot, Omit<DocumentSlot, 'id'>, Partial<DocumentSlot>>
      assignments: TableDef<Assignment, Omit<Assignment, 'id' | 'assigned_at'>, Partial<Assignment>>
      submissions: TableDef<Submission, Omit<Submission, 'id' | 'created_at' | 'updated_at'>, Partial<Submission>>
      field_answers: TableDef<FieldAnswer, Omit<FieldAnswer, 'id'>, Partial<FieldAnswer>>
      document_uploads: TableDef<DocumentUpload, Omit<DocumentUpload, 'id' | 'uploaded_at'>, Partial<DocumentUpload>>
      applications: TableDef<Application, Omit<Application, 'id' | 'created_at' | 'updated_at'>, Partial<Application>>
      rate_limits: TableDef<RateLimit, RateLimit, Partial<RateLimit>>
    }
    Views: Record<string, never>
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
    }
  }
}
