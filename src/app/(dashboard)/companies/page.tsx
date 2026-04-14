import { createClient } from "@/lib/supabase/server";
import { CompanyTable } from "@/components/companies/company-table";

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
}

export default async function CompaniesPage() {
  const supabase = createClient();

  // Get all contacts with company
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, company");

  // Get all sends
  const { data: sends } = await supabase
    .from("sends")
    .select("contact_id, status, sent_at, opened_at, clicked_at, replied_at, bounced_at");

  // Build company -> contact_id map
  const companyByContactId = new Map<string, string>();
  const companyContacts = new Map<string, number>();
  for (const c of contacts || []) {
    const company = (c.company ?? "").trim();
    if (!company) continue;
    companyByContactId.set(c.id, company);
    companyContacts.set(company, (companyContacts.get(company) || 0) + 1);
  }

  // Aggregate stats per company
  const byCompany = new Map<string, CompanyStats>();
  companyContacts.forEach((count, company) => {
    byCompany.set(company, {
      company,
      contacts: count,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      openRate: 0,
      clickRate: 0,
      lastActivity: null,
    });
  });

  for (const s of sends || []) {
    const company = companyByContactId.get(s.contact_id);
    if (!company) continue;
    const stat = byCompany.get(company)!;

    if (!["pending", "failed"].includes(s.status)) stat.sent++;
    if (["delivered", "opened", "clicked", "replied"].includes(s.status)) stat.delivered++;
    if (["opened", "clicked", "replied"].includes(s.status)) stat.opened++;
    if (s.status === "clicked") stat.clicked++;
    if (s.status === "replied") stat.replied++;
    if (s.status === "bounced") stat.bounced++;

    // Track most recent activity
    const times = [s.sent_at, s.opened_at, s.clicked_at, s.replied_at, s.bounced_at].filter(Boolean) as string[];
    for (const t of times) {
      if (!stat.lastActivity || new Date(t) > new Date(stat.lastActivity)) {
        stat.lastActivity = t;
      }
    }
  }

  // Calculate rates
  const rows: CompanyStats[] = Array.from(byCompany.values()).map((r) => ({
    ...r,
    openRate: r.sent > 0 ? Math.round((r.opened / r.sent) * 100) : 0,
    clickRate: r.sent > 0 ? Math.round((r.clicked / r.sent) * 100) : 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
      </div>
      <CompanyTable companies={rows} />
    </div>
  );
}
