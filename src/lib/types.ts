export type ContactStatus = "not_contacted" | "sent" | "delivered" | "opened" | "clicked" | "bounced";
export type LeadStage = "new_lead" | "email_sent" | "opened" | "follow_up_needed" | "follow_up_sent" | "replied" | "meeting_booked" | "closed_won" | "closed_lost";
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
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  resend_api_key: string | null;
  from_email: string | null;
  from_name: string | null;
  daily_send_limit: number;
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
