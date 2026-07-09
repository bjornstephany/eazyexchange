// App-facing DB types. types/supabase.ts is GENERATED from the live schema —
// regenerate it after every migration (see CLAUDE.md → Database). This module
// narrows generated rows with the app's closed unions; if a migration isn't
// re-generated, the aliases below break the build instead of drifting silently.
import type { Database as Generated, Tables } from './supabase'

export type { Json, Tables, TablesInsert, TablesUpdate } from './supabase'

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

// Narrow chosen columns of a generated row to the app's closed unions.
// `Narrow extends Partial<Row>` anchors every override to a real column with a
// compatible type — schema drift here is a compile error, not silence.
type Override<Row, Narrow extends Partial<Row>> = Omit<Row, keyof Narrow> & Narrow

export type School = Override<Tables<'schools'>, {
  subscription_status: SubscriptionStatus | null
  plan: 'starter' | 'growth' | 'scale' | null
}>
export type Exchange = Tables<'exchanges'>
export type UserProfile = Override<Tables<'users'>, {
  role: Role
  org_role: OrgRole
}>
export type ExchangeEnrollment = Tables<'exchange_enrollments'>
export type FormTemplate = Override<Tables<'form_templates'>, {
  type: FormType
  kind: TemplateKind
  status: TemplateStatus
  audience: TemplateAudience
}>
export type FormField = Override<Tables<'form_fields'>, {
  field_type: FieldType
  options: string[] | null
}>
export type DocumentSlot = Tables<'document_slots'>
// last_reminded_at stays optional for source compatibility with existing
// call sites that construct Assignment values without it.
export type Assignment = Omit<Tables<'assignments'>, 'last_reminded_at'> & {
  last_reminded_at?: string | null
}
export type Submission = Override<Tables<'submissions'>, {
  status: SubmissionStatus
}>
export type FieldAnswer = Tables<'field_answers'>
export type DocumentUpload = Tables<'document_uploads'>
// terms_acknowledged_at stays optional (same reason as Assignment).
export type Application = Omit<
  Tables<'applications'>,
  'status' | 'data' | 'language' | 'invite_response' | 'terms_acknowledged_at'
> & {
  status: ApplicationStatus
  data: Record<string, string>
  language: 'en' | 'fr'
  invite_response: 'yes' | 'no' | 'maybe' | null
  terms_acknowledged_at?: string | null
}
export type OrganizerInvite = Tables<'organizer_invites'>
export type RateLimit = Tables<'rate_limits'>
export type Feedback = Override<Tables<'feedback'>, {
  type: 'suggestion' | 'bug'
  status: 'new' | 'reviewed' | 'done'
}>

export type EmailSendStatus = 'sent' | 'error'
export type EmailSendLog = Override<Tables<'email_send_log'>, {
  status: EmailSendStatus
}>
export type AuditLog = Omit<Tables<'audit_log'>, 'metadata'> & {
  metadata: Record<string, string | number | boolean | null>
}

// The generated Database types every table's Row with raw column types
// (closed-union columns come back as `string`). Before this file existed,
// hand-written table defs used the app's narrow alias as the Row itself, so
// a plain `supabase.from('schools').select(...)` already returned `School`
// (not `Tables<'schools'>`) with no cast at the call site. Preserve that:
// re-point each closed-union table's Row at its narrow alias, keeping
// Insert/Update/Relationships as generated. Tables without a closed-union
// column (exchanges, document_slots, ...) need no override — their alias
// already equals the generated row.
type OverrideRow<T extends keyof Generated['public']['Tables'], Row> =
  Omit<Generated['public']['Tables'][T], 'Row'> & { Row: Row }

export type Database = Omit<Generated, 'public'> & {
  public: Omit<Generated['public'], 'Tables'> & {
    Tables: Omit<
      Generated['public']['Tables'],
      | 'schools' | 'users' | 'form_templates' | 'form_fields'
      | 'submissions' | 'applications' | 'feedback'
      | 'email_send_log' | 'audit_log'
    > & {
      schools: OverrideRow<'schools', School>
      users: OverrideRow<'users', UserProfile>
      form_templates: OverrideRow<'form_templates', FormTemplate>
      form_fields: OverrideRow<'form_fields', FormField>
      submissions: OverrideRow<'submissions', Submission>
      applications: OverrideRow<'applications', Application>
      feedback: OverrideRow<'feedback', Feedback>
      email_send_log: OverrideRow<'email_send_log', EmailSendLog>
      audit_log: OverrideRow<'audit_log', AuditLog>
    }
  }
}
