import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGoogleSheet } from "@/lib/import/google-sheets";
import { fetchNotionDatabase } from "@/lib/import/notion";
import { normalizeContacts } from "@/lib/import/normalize";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { source, config } = body;

  try {
    let rawRows;

    if (source === "google-sheets") {
      rawRows = await fetchGoogleSheet(config.sheetUrl, config.apiKey);
    } else if (source === "notion") {
      rawRows = await fetchNotionDatabase(config.databaseId, config.token);
    } else {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    const { valid, errors } = normalizeContacts(rawRows);

    if (valid.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        errors,
      });
    }

    const contactsToInsert = valid.map((c) => ({
      user_id: user.id,
      email: c.email,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      company: c.company || null,
      role: c.role || null,
      tags: c.tags,
    }));

    let imported = 0;
    let skipped = 0;
    for (const contact of contactsToInsert) {
      const { error: insertError } = await supabase
        .from("contacts")
        .insert(contact);
      if (insertError) {
        if (insertError.message.includes("duplicate") || insertError.message.includes("unique")) {
          skipped++;
        } else {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Import failed" },
      { status: 500 }
    );
  }
}
