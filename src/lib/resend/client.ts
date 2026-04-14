import { Resend } from "resend";

export function getResendClient(apiKey: string): Resend {
  return new Resend(apiKey);
}
