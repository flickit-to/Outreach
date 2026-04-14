"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseCSV, type RawImportRow } from "@/lib/import/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Database, ArrowRight, Check } from "lucide-react";

const CONTACT_FIELDS = [
  { key: "email", label: "Email (required)", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "name", label: "Full Name (auto-splits)", required: false },
  { key: "company", label: "Company", required: false },
  { key: "role", label: "Role", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "skip", label: "-- Skip this column --", required: false },
];

// Try to auto-detect mapping
function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const h = header.toLowerCase().trim();
    if (h.includes("email") || h.includes("e-mail") || h === "mail") {
      mapping[header] = "email";
    } else if (h === "first name" || h === "first_name" || h === "firstname") {
      mapping[header] = "first_name";
    } else if (h === "last name" || h === "last_name" || h === "lastname" || h === "surname") {
      mapping[header] = "last_name";
    } else if (h.includes("name") || h === "contact" || h === "person" || h === "full name") {
      if (!mapping[header]) mapping[header] = "name";
    } else if (h.includes("company") || h.includes("organization") || h.includes("organisation") || h.includes("org") || h === "business") {
      mapping[header] = "company";
    } else if (h.includes("role") || h.includes("title") || h.includes("position") || h.includes("job")) {
      mapping[header] = "role";
    } else if (h.includes("tag") || h.includes("label") || h.includes("category")) {
      mapping[header] = "tags";
    } else {
      mapping[header] = "skip";
    }
  }
  return mapping;
}

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // CSV state
  const [, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<RawImportRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");

  // Google Sheets state
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetsApiKey, setSheetsApiKey] = useState("");

  // Notion state
  const [notionDbId, setNotionDbId] = useState("");
  const [notionToken, setNotionToken] = useState("");

  async function handleCSVSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const rows = await parseCSV(file);
    if (rows.length === 0) {
      toast({ title: "Empty file", description: "No rows found in CSV", variant: "destructive" });
      return;
    }
    const headers = Object.keys(rows[0]);
    setCsvHeaders(headers);
    setCsvRows(rows);
    setColumnMapping(autoDetectMapping(headers));
    setStep("map");
  }

  function updateMapping(csvHeader: string, contactField: string) {
    setColumnMapping((prev) => ({ ...prev, [csvHeader]: contactField }));
  }

  function getMappedPreview(): any[] {
    return csvRows.slice(0, 5).map((row) => {
      const mapped: any = {};
      for (const [csvHeader, contactField] of Object.entries(columnMapping)) {
        if (contactField !== "skip") {
          mapped[contactField] = row[csvHeader] || "";
        }
      }
      return mapped;
    });
  }

  const hasEmailMapping = Object.values(columnMapping).includes("email");

  async function handleCSVImport() {
    if (!hasEmailMapping) {
      toast({ title: "Error", description: "You must map at least one column to Email", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      let imported = 0;
      const duplicateEmails: string[] = [];
      let errors = 0;

      for (const row of csvRows) {
        // Apply mapping
        const mapped: any = {};
        for (const [csvHeader, contactField] of Object.entries(columnMapping)) {
          if (contactField !== "skip") {
            mapped[contactField] = (row[csvHeader] || "").trim();
          }
        }

        const email = (mapped.email || "").toLowerCase().trim();
        if (!email || !email.includes("@")) {
          errors++;
          continue;
        }

        // Handle name splitting
        let firstName = (mapped.first_name || "").trim();
        let lastName = (mapped.last_name || "").trim();
        if (!firstName && !lastName && mapped.name) {
          const parts = mapped.name.trim().split(/\s+/);
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ") || "";
        }

        const tags = mapped.tags
          ? mapped.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
          : [];

        const { error: insertError } = await supabase.from("contacts").insert({
          user_id: user!.id,
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          company: mapped.company || null,
          role: mapped.role || null,
          tags,
        });

        if (insertError) {
          if (insertError.message.includes("duplicate") || insertError.message.includes("unique")) {
            duplicateEmails.push(email);
          } else {
            errors++;
          }
        } else {
          imported++;
        }
      }

      const duplicateMsg = duplicateEmails.length > 0
        ? `${duplicateEmails.length} contacts not added — already exist: ${duplicateEmails.slice(0, 5).join(", ")}${duplicateEmails.length > 5 ? `, +${duplicateEmails.length - 5} more` : ""}`
        : "";

      toast({
        title: `${imported} contacts imported`,
        description: [
          duplicateMsg,
          errors > 0 ? `${errors} errors (invalid email)` : "",
        ].filter(Boolean).join(" · "),
      });
      router.push("/contacts");
      router.refresh();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSheetsImport() {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "google-sheets", config: { sheetUrl, apiKey: sheetsApiKey } }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      toast({ title: "Import complete", description: `${result.imported} contacts imported.` });
      router.push("/contacts");
      router.refresh();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleNotionImport() {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "notion", config: { databaseId: notionDbId, token: notionToken } }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      toast({ title: "Import complete", description: `${result.imported} contacts imported.` });
      router.push("/contacts");
      router.refresh();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Import Contacts</h1>

      <Tabs defaultValue="csv">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="csv" className="gap-2">
            <Upload className="h-4 w-4" />
            CSV
          </TabsTrigger>
          <TabsTrigger value="sheets" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Google Sheets
          </TabsTrigger>
          <TabsTrigger value="notion" className="gap-2">
            <Database className="h-4 w-4" />
            Notion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csv">
          <Card>
            <CardHeader>
              <CardTitle>
                {step === "upload" && "Import from CSV"}
                {step === "map" && "Map Columns"}
                {step === "preview" && "Preview & Import"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: Upload */}
              {step === "upload" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Upload a CSV file. You&apos;ll map the columns in the next step.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="csv-file">Select CSV File</Label>
                    <Input id="csv-file" type="file" accept=".csv" onChange={handleCSVSelect} />
                  </div>
                </>
              )}

              {/* Step 2: Map columns */}
              {step === "map" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    We found <strong>{csvHeaders.length} columns</strong> and{" "}
                    <strong>{csvRows.length} rows</strong>. Map each CSV column to a contact field.
                  </p>

                  {/* Step indicator */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">1. Upload</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-foreground font-medium">2. Map Columns</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>3. Import</span>
                  </div>

                  <div className="space-y-3 border rounded-md p-4">
                    {csvHeaders.map((header) => (
                      <div key={header} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{header}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            e.g. &quot;{csvRows[0]?.[header] || ""}&quot;
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <select
                          value={columnMapping[header] || "skip"}
                          onChange={(e) => updateMapping(header, e.target.value)}
                          className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm"
                        >
                          {CONTACT_FIELDS.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {!hasEmailMapping && (
                    <p className="text-sm text-red-600">
                      You must map at least one column to &quot;Email&quot;
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setStep("preview")}
                      disabled={!hasEmailMapping}
                    >
                      Next: Preview
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    <Button variant="outline" onClick={() => { setStep("upload"); setCsvFile(null); setCsvHeaders([]); setCsvRows([]); }}>
                      Back
                    </Button>
                  </div>
                </>
              )}

              {/* Step 3: Preview & Import */}
              {step === "preview" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Preview of the first 5 contacts. Click Import to add all {csvRows.length} contacts.
                  </p>

                  {/* Step indicator */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>1. Upload</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>2. Map Columns</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-foreground font-medium">3. Import</span>
                  </div>

                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {Object.entries(columnMapping)
                            .filter(([, v]) => v !== "skip")
                            .map(([, field]) => (
                              <th key={field} className="px-3 py-2 text-left text-xs font-medium capitalize">
                                {field}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getMappedPreview().map((row, i) => (
                          <tr key={i} className="border-b">
                            {Object.entries(columnMapping)
                              .filter(([, v]) => v !== "skip")
                              .map(([, field]) => (
                                <td key={field} className="px-3 py-2 text-sm">
                                  {row[field] || ""}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {csvRows.length} total rows will be imported. Duplicates (same email) will be skipped.
                  </p>

                  <div className="flex gap-2">
                    <Button onClick={handleCSVImport} disabled={loading}>
                      {loading ? "Importing..." : `Import ${csvRows.length} Contacts`}
                      <Check className="h-4 w-4 ml-2" />
                    </Button>
                    <Button variant="outline" onClick={() => setStep("map")}>
                      Back
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sheets">
          <Card>
            <CardHeader>
              <CardTitle>Import from Google Sheets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sheet must be public. First row should be headers.
              </p>
              <div className="space-y-2">
                <Label htmlFor="sheet-url">Google Sheet URL</Label>
                <Input id="sheet-url" placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheets-api-key">Google API Key</Label>
                <Input id="sheets-api-key" type="password" placeholder="Your Google API key" value={sheetsApiKey} onChange={(e) => setSheetsApiKey(e.target.value)} />
              </div>
              <Button onClick={handleSheetsImport} disabled={!sheetUrl || !sheetsApiKey || loading}>
                {loading ? "Importing..." : "Import"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notion">
          <Card>
            <CardHeader>
              <CardTitle>Import from Notion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a Notion integration and share the database with it.
              </p>
              <div className="space-y-2">
                <Label htmlFor="notion-db">Notion Database ID</Label>
                <Input id="notion-db" placeholder="abc123..." value={notionDbId} onChange={(e) => setNotionDbId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notion-token">Integration Token</Label>
                <Input id="notion-token" type="password" placeholder="secret_..." value={notionToken} onChange={(e) => setNotionToken(e.target.value)} />
              </div>
              <Button onClick={handleNotionImport} disabled={!notionDbId || !notionToken || loading}>
                {loading ? "Importing..." : "Import"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
