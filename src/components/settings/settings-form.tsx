"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { settingsSchema, senderEmailSchema, type SettingsInput } from "@/lib/validators";
import type { Settings, SenderEmail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Mail, X, PenTool } from "lucide-react";

export function SettingsForm({
  initialData,
  senderEmails: initialSenderEmails,
  userId,
}: {
  initialData: Settings | null;
  senderEmails: SenderEmail[];
  userId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [senderEmails, setSenderEmails] = useState<SenderEmail[]>(initialSenderEmails);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState(initialData?.signature_html || "");
  const [signatureImageUrl, setSignatureImageUrl] = useState(initialData?.signature_image_url || "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      resend_api_key: initialData?.resend_api_key || "",
      from_email: initialData?.from_email || "",
      from_name: initialData?.from_name || "",
      daily_send_limit: initialData?.daily_send_limit || 20,
      signature_html: initialData?.signature_html || "",
      signature_image_url: initialData?.signature_image_url || "",
    },
  });

  async function onSubmit(data: SettingsInput) {
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.from("settings").upsert(
      {
        user_id: userId,
        ...data,
        signature_html: signatureHtml || null,
        signature_image_url: signatureImageUrl || null,
      },
      { onConflict: "user_id" }
    );

    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Settings saved", description: "Your settings have been updated." });
  }

  async function addSenderEmail() {
    const result = senderEmailSchema.safeParse({ email: newEmail, name: newName });
    if (!result.success) {
      toast({
        title: "Invalid",
        description: result.error.issues?.[0]?.message || result.error.message,
        variant: "destructive",
      });
      return;
    }

    setAddingEmail(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sender_emails")
      .insert({ user_id: userId, email: newEmail.toLowerCase().trim(), name: newName.trim() })
      .select()
      .single();

    setAddingEmail(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message.includes("unique") ? "This email already exists." : error.message,
        variant: "destructive",
      });
      return;
    }

    setSenderEmails([...senderEmails, data as SenderEmail]);
    setNewEmail("");
    setNewName("");
    toast({ title: "Sender email added" });
    router.refresh();
  }

  async function removeSenderEmail(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("sender_emails").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setSenderEmails(senderEmails.filter((s) => s.id !== id));
    toast({ title: "Sender email removed" });
    router.refresh();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be less than 2MB", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/signature-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("signatures").getPublicUrl(path);
    setSignatureImageUrl(publicUrl);
    setUploadingImage(false);
    toast({ title: "Image uploaded" });
  }

  function removeSignatureImage() {
    setSignatureImageUrl("");
  }

  async function saveSignature() {
    const supabase = createClient();
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: userId,
        signature_html: signatureHtml || null,
        signature_image_url: signatureImageUrl || null,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Signature saved" });
  }

  return (
    <div className="space-y-6">
      {/* API & General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend_api_key">Resend API Key</Label>
              <Input
                id="resend_api_key"
                type="password"
                placeholder="re_..."
                {...register("resend_api_key")}
              />
              {errors.resend_api_key && (
                <p className="text-sm text-red-600">{errors.resend_api_key.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_email">Default From Email</Label>
              <Input
                id="from_email"
                type="email"
                placeholder="you@yourdomain.com"
                {...register("from_email")}
              />
              <p className="text-xs text-muted-foreground">
                Fallback email if no sender emails are configured below
              </p>
              {errors.from_email && (
                <p className="text-sm text-red-600">{errors.from_email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_name">Default From Name</Label>
              <Input
                id="from_name"
                placeholder="Your Name"
                {...register("from_name")}
              />
              {errors.from_name && (
                <p className="text-sm text-red-600">{errors.from_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_send_limit">Daily Send Limit</Label>
              <Input
                id="daily_send_limit"
                type="number"
                min={1}
                max={100}
                {...register("daily_send_limit", { valueAsNumber: true })}
              />
              {errors.daily_send_limit && (
                <p className="text-sm text-red-600">{errors.daily_send_limit.message}</p>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" />
            Email Signature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Appended to every email. Supports HTML and personalization variables ({"{{first_name}}"}, {"{{company}}"}, etc.). Links are automatically tracked.
          </p>

          <div className="space-y-2">
            <Label>Signature Image (optional)</Label>
            {signatureImageUrl ? (
              <div className="flex items-center gap-3 p-3 border rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureImageUrl} alt="Signature" className="max-h-16 rounded" />
                <Button type="button" variant="ghost" size="sm" onClick={removeSignatureImage}>
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  id="signature-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
                {uploadingImage && <span className="text-xs text-muted-foreground">Uploading...</span>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Max 2MB. Recommended: 400x100px logo or photo.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature_html">Signature (HTML)</Label>
            <Textarea
              id="signature_html"
              value={signatureHtml}
              onChange={(e) => setSignatureHtml(e.target.value)}
              rows={6}
              placeholder={`Best,\nRyan Sri\nCEO at KlickFlow\n<a href="https://linkedin.com/in/yourhandle">LinkedIn</a>`}
            />
            <p className="text-xs text-muted-foreground">
              You can use HTML tags like &lt;a href=&quot;...&quot;&gt; for links. LinkedIn clicks are tracked specifically.
            </p>
          </div>

          {(signatureHtml || signatureImageUrl) && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="p-4 border rounded-md bg-muted/30 text-sm">
                {signatureImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signatureImageUrl} alt="Signature" style={{ maxWidth: "120px", marginBottom: "8px" }} />
                )}
                <div
                  dangerouslySetInnerHTML={{
                    __html: signatureHtml
                      .split("\n")
                      .map((l) => (l.trim() ? `<div>${l}</div>` : "<br>"))
                      .join(""),
                  }}
                />
              </div>
            </div>
          )}

          <Button type="button" onClick={saveSignature}>Save Signature</Button>
        </CardContent>
      </Card>

      {/* Sender Emails */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Sender Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add multiple sender emails. When creating a campaign, you can pick a specific sender
            or let the system auto-rotate between them to spread volume.
          </p>

          {/* Existing sender emails */}
          {senderEmails.length > 0 ? (
            <div className="space-y-2">
              {senderEmails.map((sender) => (
                <div
                  key={sender.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                >
                  <div>
                    <p className="text-sm font-medium">{sender.name}</p>
                    <p className="text-xs text-muted-foreground">{sender.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeSenderEmail(sender.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No sender emails added yet. The default from email above will be used.
            </p>
          )}

          <Separator />

          {/* Add new sender email */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Add Sender Email</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-name" className="text-xs">Name</Label>
                <Input
                  id="new-name"
                  placeholder="John Smith"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-email" className="text-xs">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="john@yourdomain.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSenderEmail}
              disabled={addingEmail || !newEmail || !newName}
            >
              <Plus className="h-4 w-4 mr-2" />
              {addingEmail ? "Adding..." : "Add Sender"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
