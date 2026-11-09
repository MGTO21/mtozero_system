import { createSign } from 'node:crypto';
import type { SocialKind, SocialPost } from './pick';

/**
 * Privileged Firestore access for the social feed, over REST with a service
 * account. Server routes only — never import this from a client component.
 *
 * socialPosts is closed to every browser by firestore.rules; this is the only
 * writer. The token is signed here with node:crypto rather than pulling in
 * firebase-admin: one collection, two calls, no reason for the extra cold start.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON downloaded from the
 * Firebase console (Project settings → Service accounts → Generate new private key).
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    // Pasted into a single-line env field, the key's newlines often arrive escaped.
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

export function adminConfigured(): boolean {
  return serviceAccount() !== null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${base64url(signer.sign(account.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function authed(path: string, init: RequestInit): Promise<Response> {
  const account = serviceAccount();
  if (!account) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const token = await accessToken(account);
  const url = `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents${path}`;
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}

type Fields = Record<string, { stringValue?: string; integerValue?: string; timestampValue?: string }>;

const KINDS = new Set<SocialKind>(['new', 'last', 'spotlight']);

function toPost(fields: Fields): SocialPost | null {
  const kind = fields.kind?.stringValue as SocialKind | undefined;
  const postedAtMs = Date.parse(fields.postedAt?.timestampValue ?? '');
  if (!fields.productId?.stringValue || !kind || !KINDS.has(kind) || !Number.isFinite(postedAtMs)) return null;
  return {
    productId: fields.productId.stringValue,
    kind,
    fbPostId: fields.fbPostId?.stringValue ?? '',
    templateIndex: Number(fields.templateIndex?.integerValue ?? 0),
    family: fields.family?.stringValue ?? '',
    postedAtMs,
  };
}

/** Posts since a moment, newest first. */
export async function recentPosts(sinceMs: number): Promise<SocialPost[]> {
  const res = await authed(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'socialPosts' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'postedAt' },
            op: 'GREATER_THAN_OR_EQUAL',
            value: { timestampValue: new Date(sinceMs).toISOString() },
          },
        },
        orderBy: [{ field: { fieldPath: 'postedAt' }, direction: 'DESCENDING' }],
        limit: 200,
      },
    }),
  });
  if (!res.ok) throw new Error(`socialPosts query failed: ${res.status}`);
  const rows = (await res.json()) as { document?: { fields?: Fields } }[];
  return rows.flatMap((r) => {
    const post = r.document ? toPost(r.document.fields ?? {}) : null;
    return post ? [post] : [];
  });
}

/** Records a post that went out. Returns the new document id. */
export async function recordPost(post: Omit<SocialPost, 'postedAtMs'>): Promise<string> {
  const res = await authed('/socialPosts', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        productId: { stringValue: post.productId },
        kind: { stringValue: post.kind },
        fbPostId: { stringValue: post.fbPostId },
        templateIndex: { integerValue: String(post.templateIndex) },
        family: { stringValue: post.family },
        postedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!res.ok) throw new Error(`socialPosts write failed: ${res.status}`);
  const json = (await res.json()) as { name: string };
  return json.name.slice(json.name.lastIndexOf('/') + 1);
}
