// Microsoft Graph API helpers — raw fetch, no SDK.
// Doc reference: https://learn.microsoft.com/en-us/graph/api/overview

const TENANT = process.env.MS_GRAPH_TENANT_ID!;
const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET!;

const OAUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Read.Shared",
  "Mail.Send",
  "Mail.Send.Shared",
];

export function getAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  });
  return `${OAUTH_BASE}/authorize?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: "Bearer";
};

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function graphGet<T = any>(
  accessToken: string,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(GRAPH_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      // Get categories + bodyPreview
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export type GraphMessage = {
  id: string;
  internetMessageId?: string;
  subject: string | null;
  bodyPreview: string | null;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: { emailAddress: { address: string; name?: string } }[];
  ccRecipients?: { emailAddress: { address: string; name?: string } }[];
  sender?: { emailAddress: { address: string; name?: string } };
  receivedDateTime: string;
  sentDateTime?: string;
  categories?: string[];
  conversationId?: string;
  isDraft?: boolean;
};

export type GraphProfile = {
  id: string;
  userPrincipalName: string;
  mail?: string;
  displayName?: string;
};

export async function getProfile(accessToken: string): Promise<GraphProfile> {
  return graphGet<GraphProfile>(accessToken, "/me");
}

/**
 * List messages tagged with a given category, plus all messages in a given
 * mail folder (e.g. Sent Items, Inbox). Use one call per folder.
 *
 * We use $filter on categories to keep volume sane.
 */
export async function listMessagesByCategory(
  accessToken: string,
  options: {
    folder: "inbox" | "sentitems";
    category?: string;
    sinceIso: string;
    top?: number;
  },
): Promise<{ value: GraphMessage[]; "@odata.nextLink"?: string }> {
  const filters: string[] = [];
  filters.push(`receivedDateTime ge ${options.sinceIso}`);
  if (options.category) {
    filters.push(`categories/any(c: c eq '${options.category.replace(/'/g, "''")}')`);
  }
  return graphGet(accessToken, `/me/mailFolders/${options.folder}/messages`, {
    $filter: filters.join(" and "),
    $top: String(options.top ?? 50),
    $select:
      "id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,sender,receivedDateTime,sentDateTime,categories,conversationId,isDraft",
    $orderby: "receivedDateTime desc",
  });
}

export type GraphSendMessage = {
  subject: string;
  bodyHtml: string;
  to: { address: string; name?: string }[];
  cc?: { address: string; name?: string }[];
  bcc?: { address: string; name?: string }[];
  internetMessageHeaders?: { name: string; value: string }[];
};

/**
 * Send an email via the authenticated user's Outlook mailbox.
 * Returns nothing on success — Graph 202 Accepted has no body.
 * On failure, throws with the upstream error text.
 */
export async function sendMail(accessToken: string, msg: GraphSendMessage): Promise<void> {
  const payload = {
    message: {
      subject: msg.subject,
      body: { contentType: "HTML", content: msg.bodyHtml },
      toRecipients: msg.to.map((r) => ({ emailAddress: { address: r.address, name: r.name } })),
      ccRecipients: (msg.cc || []).map((r) => ({ emailAddress: { address: r.address, name: r.name } })),
      bccRecipients: (msg.bcc || []).map((r) => ({ emailAddress: { address: r.address, name: r.name } })),
      ...(msg.internetMessageHeaders && msg.internetMessageHeaders.length > 0
        ? { internetMessageHeaders: msg.internetMessageHeaders }
        : {}),
    },
    saveToSentItems: true,
  };
  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}

export async function listMessagesByContact(
  accessToken: string,
  options: { folder: "inbox" | "sentitems"; contactEmail: string; sinceIso: string; top?: number },
): Promise<{ value: GraphMessage[] }> {
  // Match where the contact appears as sender (inbox) or recipient (sent)
  const escaped = options.contactEmail.replace(/'/g, "''");
  const filter =
    options.folder === "inbox"
      ? `receivedDateTime ge ${options.sinceIso} and from/emailAddress/address eq '${escaped}'`
      : `sentDateTime ge ${options.sinceIso} and toRecipients/any(r: r/emailAddress/address eq '${escaped}')`;
  return graphGet(accessToken, `/me/mailFolders/${options.folder}/messages`, {
    $filter: filter,
    $top: String(options.top ?? 50),
    $select:
      "id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,sender,receivedDateTime,sentDateTime,categories,conversationId,isDraft",
    $orderby: "receivedDateTime desc",
  });
}
