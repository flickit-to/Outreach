import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const contactSchema = z.object({
  email: z.string().email("Invalid email address"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  tags: z.string().optional(), // comma-separated, parsed to array
  notes: z.string().optional(),
});

export const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  subject: z.string().max(200, "Subject too long"),
  subject_b: z.string().max(200).optional(),
  body: z.string().min(1, "Email body is required"),
  scheduled_at: z.string().optional(),
  from_email_id: z.string().optional(), // null = auto-rotate
  list_id: z.string().optional(),
  parent_campaign_id: z.string().optional(),
  trigger_engagement: z.enum(["opened", "clicked", "opened_or_clicked"]).optional(),
  send_days: z.array(z.number().min(0).max(6)).optional(),
});

export const senderEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
});

export const settingsSchema = z.object({
  resend_api_key: z.string().min(1, "API key is required"),
  from_email: z.string().email("Invalid email address"),
  from_name: z.string().min(1, "Name is required"),
  daily_send_limit: z.number().min(1).max(100),
  signature_html: z.string().max(10000).optional().nullable(),
  signature_image_url: z.string().optional().nullable(),
});

export const importRowSchema = z.object({
  email: z.string().email(),
  name: z.string().optional().default(""),
  company: z.string().optional().default(""),
  tags: z.string().optional().default(""),
});

// =============================================================================
// v2: Sequences
// =============================================================================

export const sequenceStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    subject: z.string().min(1, "Subject is required").max(200),
    subject_b: z.string().max(200).optional(),
    body: z.string().min(1, "Email body is required"),
    send_as_reply: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("wait"),
    delay_days: z.number().min(0).max(365),
    delay_hours: z.number().min(0).max(23).optional(),
  }),
  z.object({
    type: z.literal("condition"),
    triggers: z
      .array(z.enum(["opened", "clicked", "opened_or_clicked", "replied", "not_opened", "not_replied"]))
      .min(1, "Pick at least one trigger"),
    within_days: z.number().min(1).max(60),
    on_false: z.enum(["end", "continue"]).default("end"),
  }),
]);

export const sequenceSchema = z.object({
  name: z.string().min(1, "Sequence name is required").max(120),
  list_id: z.string().uuid().nullable().optional(),
  from_email_id: z.string().uuid().nullable().optional(),
  send_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  scheduled_at: z.string().optional().nullable(),
  steps: z.array(sequenceStepSchema).min(1, "Add at least one step"),
});

export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
export type SequenceInput = z.infer<typeof sequenceSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
