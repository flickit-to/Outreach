import { createClient } from "@/lib/supabase/server";
import { CompanyTable } from "@/components/companies/company-table";

export interface CompanyContactStats {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  lead_stage: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  last_activity: string | null;
}

export interface CompanyStats {
  company: string;
  contacts: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  lastActivity: string | null;
  contactList: CompanyContactStats[];
}

export default async function CompaniesPage() {
  const supabase = createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, email, first_name, last_name, role, lead_stage, company");

  const { data: sends } = await supabase
    .from("sends")
    .select("contact_id, status, sent_at, opened_at, clicked_at, replied_at, bounced_at");

  // Build contact lookup + bucket contacts by company
  const contactById = new Map<string, NonNullable<typeof contacts>[number]>();
  const contactsByCompany = new Map<string, CompanyContactStats[]>();
  for (const c of contacts || []) {
    const company = (c.company ?? "").trim();
    if (!company) continue;
    contactById.set(c.id, c);
    const stats: CompanyContactStats = {
      contact_id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      role: c.role,
      lead_stage: c.lead_stage,
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      last_activity: null,
    };
    if (!contactsByCompany.has(company)) contactsByCompany.set(company, []);
    contactsByCompany.get(company)!.push(stats);
  }

  // Per-contact stats (also feeds per-company aggregation)
  const contactStatsById = new Map<string, CompanyContactStats>();
  Array.from(contactsByCompany.values()).forEach((arr) => {
    for (const s of arr) contactStatsById.set(s.contact_id, s);
  });

  for (const s of sends || []) {
    const stat = contactStatsById.get(s.contact_id);
    if (!stat) continue;

    if (!["pending", "failed"].includes(s.status)) stat.sent++;
    if (["opened", "clicked", "replied"].includes(s.status)) stat.opened++;
    if (s.status === "clicked") stat.clicked++;
    if (s.status === "replied") stat.replied++;
    if (s.status === "bounced") stat.bounced++;

    const times = [s.sent_at, s.opened_at, s.clicked_at, s.replied_at, s.bounced_at]
      .filter(Boolean) as string[];
    for (const t of times) {
      if (!stat.last_activity || new Date(t) > new Date(stat.last_activity)) {
        stat.last_activity = t;
      }
    }
  }

  // Roll up per-contact stats to per-company
  const rows: CompanyStats[] = [];
  for (const [company, list] of Array.from(contactsByCompany.entries())) {
    let sent = 0, delivered = 0, opened = 0, clicked = 0, replied = 0, bounced = 0;
    let lastActivity: string | null = null;
    for (const s of list) {
      sent += s.sent;
      opened += s.opened;
      clicked += s.clicked;
      replied += s.replied;
      bounced += s.bounced;
      if (s.last_activity && (!lastActivity || new Date(s.last_activity) > new Date(lastActivity))) {
        lastActivity = s.last_activity;
      }
    }
    // Re-derive delivered for the table column (same logic as before)
    for (const s of sends || []) {
      const stat = contactStatsById.get(s.contact_id);
      if (!stat) continue;
      const c = contactById.get(s.contact_id);
      if (!c || (c.company ?? "").trim() !== company) continue;
      if (["delivered", "opened", "clicked", "replied"].includes(s.status)) delivered++;
    }
    rows.push({
      company,
      contacts: list.length,
      sent,
      delivered,
      opened,
      clicked,
      replied,
      bounced,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
      lastActivity,
      contactList: list,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
      </div>
      <CompanyTable companies={rows} />
    </div>
  );
}
