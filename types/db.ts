export type Role = 'organizer' | 'student'
export type FormType = 'data_entry' | 'document_upload'
export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type FieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select'

export interface School { id: string; name: string; created_at: string }
export interface Exchange {
  id: string; name: string; year: number
  school_a_id: string; school_b_id: string; created_at: string
}
export interface UserProfile {
  id: string; school_id: string; role: Role
  full_name: string; email: string; created_at: string
}
export interface ExchangeEnrollment { id: string; exchange_id: string; user_id: string; created_at: string }
export interface FormTemplate {
  id: string; exchange_id: string; school_id: string
  name: string; description: string | null; type: FormType
  deadline: string; created_by: string; created_at: string
}
export interface FormField {
  id: string; template_id: string; label: string
  field_type: FieldType; options: string[] | null
  required: boolean; order: number
}
export interface DocumentSlot {
  id: string; template_id: string; label: string
  description: string | null; required: boolean; order: number
}
export interface Assignment { id: string; template_id: string; student_id: string; assigned_at: string }
export interface Submission {
  id: string; assignment_id: string; status: SubmissionStatus
  submitted_at: string | null; reviewed_at: string | null
  reviewer_id: string | null; review_note: string | null
  created_at: string; updated_at: string
}
export interface FieldAnswer { id: string; submission_id: string; field_id: string; value: string }
export interface DocumentUpload {
  id: string; submission_id: string; slot_id: string
  storage_path: string; file_name: string; uploaded_at: string
}

export interface Database {
  public: {
    Tables: {
      schools: { Row: School; Insert: Omit<School, 'id' | 'created_at'>; Update: Partial<School> }
      exchanges: { Row: Exchange; Insert: Omit<Exchange, 'id' | 'created_at'>; Update: Partial<Exchange> }
      users: { Row: UserProfile; Insert: Omit<UserProfile, 'created_at'>; Update: Partial<UserProfile> }
      exchange_enrollments: { Row: ExchangeEnrollment; Insert: Omit<ExchangeEnrollment, 'id' | 'created_at'>; Update: Partial<ExchangeEnrollment> }
      form_templates: { Row: FormTemplate; Insert: Omit<FormTemplate, 'id' | 'created_at'>; Update: Partial<FormTemplate> }
      form_fields: { Row: FormField; Insert: Omit<FormField, 'id'>; Update: Partial<FormField> }
      document_slots: { Row: DocumentSlot; Insert: Omit<DocumentSlot, 'id'>; Update: Partial<DocumentSlot> }
      assignments: { Row: Assignment; Insert: Omit<Assignment, 'id' | 'assigned_at'>; Update: Partial<Assignment> }
      submissions: { Row: Submission; Insert: Omit<Submission, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Submission> }
      field_answers: { Row: FieldAnswer; Insert: Omit<FieldAnswer, 'id'>; Update: Partial<FieldAnswer> }
      document_uploads: { Row: DocumentUpload; Insert: Omit<DocumentUpload, 'id' | 'uploaded_at'>; Update: Partial<DocumentUpload> }
    }
  }
}
