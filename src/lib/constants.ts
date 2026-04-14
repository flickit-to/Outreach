import {
  LayoutDashboard,
  Users,
  Building2,
  List,
  Mail,
  Settings,
} from "lucide-react";

export const DAILY_SEND_LIMIT = 20;

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Lists", href: "/lists", icon: List },
  { label: "Campaigns", href: "/campaigns", icon: Mail },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

export const CONTACT_STATUSES = [
  { value: "not_contacted", label: "Not Contacted", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800" },
  { value: "delivered", label: "Delivered", color: "bg-indigo-100 text-indigo-800" },
  { value: "opened", label: "Opened", color: "bg-yellow-100 text-yellow-800" },
  { value: "clicked", label: "Engaged", color: "bg-green-100 text-green-800" },
  { value: "bounced", label: "Bounced", color: "bg-red-100 text-red-800" },
] as const;

export const LEAD_STAGES = [
  { value: "new_lead", label: "New Lead", color: "bg-gray-100 text-gray-800", action: "" },
  { value: "email_sent", label: "Email Sent", color: "bg-blue-100 text-blue-800", action: "Wait for response" },
  { value: "opened", label: "Opened", color: "bg-yellow-100 text-yellow-800", action: "Monitor for reply" },
  { value: "follow_up_needed", label: "Follow Up Needed", color: "bg-orange-100 text-orange-800", action: "Send a follow up" },
  { value: "follow_up_sent", label: "Follow Up Sent", color: "bg-indigo-100 text-indigo-800", action: "Wait for response" },
  { value: "replied", label: "Replied", color: "bg-green-100 text-green-800", action: "Engage & respond" },
  { value: "meeting_booked", label: "Meeting Booked", color: "bg-purple-100 text-purple-800", action: "Prepare for meeting" },
  { value: "closed_won", label: "Closed (Won)", color: "bg-emerald-100 text-emerald-800", action: "Onboard" },
  { value: "closed_lost", label: "Closed (Lost)", color: "bg-red-100 text-red-800", action: "" },
] as const;

export const CAMPAIGN_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-800" },
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-800" },
  { value: "sending", label: "Sending", color: "bg-yellow-100 text-yellow-800" },
  { value: "sent", label: "Sent", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
] as const;
