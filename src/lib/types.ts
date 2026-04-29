export type ContactStatus = "not_contacted" | "sent" | "delivered" | "opened" | "clicked" | "bounced";
export type LeadStage = "new_lead" | "email_sent" | "opened" | "follow_up_needed" | "follow_up_sent" | "replied" | "meeting_booked" | "closed_won" | "closed_lost" | "bounced";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type SendStatus = "pending" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed" | "replied";
export type EventType = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "replied";
export type ABVariant = "A" | "B";

export interface Contact {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  assigned_sender_id: string | null;
  tags: string[];
  status: ContactStatus;
  lead_stage: LeadStage;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  subject_b: string | null;
  body: string;
  scheduled_at: string | null;
  sent_at: string | null;
  from_email_id: string | null;
  list_id: string | null;
  parent_campaign_id: string | null;
  trigger_engagement: "opened" | "clicked" | "opened_or_clicked" | null;
  send_as_reply: boolean;
  send_days: number[];
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
}

export interface Send {
  id: string;
  campaign_id: string;
  contact_id: string;
  resend_id: string | null;
  message_id: string | null;
  sender_email_id: string | null;
  from_email_address: string | null;
  status: SendStatus;
  variant: ABVariant;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  send_id: string;
  type: EventType;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type TagColor = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red" | "teal";

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: TagColor;
  created_at: string;
}

export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  brown: "bg-amber-100 text-amber-800 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  green: "bg-green-100 text-green-700 border-green-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
  red: "bg-red-100 text-red-700 border-red-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
};

export const TAG_COLORS: TagColor[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "teal"];

export interface ContactList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactListWithCount extends ContactList {
  contact_count: number;
}

export interface ListContact {
  id: string;
  list_id: string;
  contact_id: string;
}

export interface SenderEmail {
  id: string;
  user_id: string;
  email: string;
  name: string;
  daily_limit: number;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  resend_api_key: string | null;
  from_email: string | null;
  from_name: string | null;
  daily_send_limit: number;
  signature_html: string | null;
  signature_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Extended types for joins
export interface SendWithContact extends Send {
  contacts: Contact;
}

export interface SendWithEvents extends Send {
  events: Event[];
  contacts: Contact;
}

export interface CampaignWithStats extends Campaign {
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
}

export interface ContactActivity {
  event: Event;
  send: Send;
  campaign: Campaign;
}

// =============================================================================
// v2: Sequences / Broadcasts / Automations
// =============================================================================

export type SequenceStatus = "draft" | "active" | "paused" | "archived";
export type StepType = "email" | "wait" | "condition";
export type ConditionTrigger =
  | "opened"
  | "clicked"
  | "opened_or_clicked"
  | "replied"
  | "not_opened";
export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "exited"
  | "unsubscribed";

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  status: SequenceStatus;
  list_id: string | null;
  from_email_id: string | null;
  send_days: number[];
  scheduled_at: string | null;
  legacy_campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  type: StepType;
  // email
  subject: string | null;
  subject_b: string | null;
  body: string | null;
  send_as_reply: boolean;
  // wait
  delay_days: number | null;
  delay_hours: number | null;
  // condition
  triggers: ConditionTrigger[] | null;
  within_days: number | null;
  on_true_step_id: string | null;
  on_false_step_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  sequence_id: string;
  contact_id: string;
  current_step_id: string | null;
  status: EnrollmentStatus;
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  exit_reason: string | null;
}

export interface SequenceWithStats extends Sequence {
  total_enrollments: number;
  active_enrollments: number;
  step_count: number;
}

export interface SequenceWithSteps extends Sequence {
  steps: SequenceStep[];
}

// Broadcasts and Automations placeholders — fleshed out in later phases.
export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export interface Broadcast {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body: string;
  list_id: string | null;
  segment_filter: Record<string, unknown>;
  from_email_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  status: BroadcastStatus;
  created_at: string;
  updated_at: string;
}

export type AutomationStatus = "active" | "paused" | "archived";
export type AutomationTriggerType =
  | "list_joined"
  | "stage_changed"
  | "tag_added"
  | "email_opened"
  | "email_clicked"
  | "email_not_opened"
  | "replied"
  | "manual"
  | "schedule";
export type AutomationActionType =
  | "enroll_in_sequence"
  | "enroll_in_broadcast"
  | "set_lead_stage"
  | "add_tag"
  | "remove_tag"
  | "add_to_list"
  | "remove_from_list"
  | "exit_sequence"
  | "notify_user";

export interface Automation {
  id: string;
  user_id: string;
  name: string;
  status: AutomationStatus;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
