// Notificaciones push a iOS por APNs (sin Firebase). Usa HTTP/2 + un JWT ES256
// firmado con la llave .p8 de Apple. Todo con modulos nativos de Node (node:http2,
// node:crypto): NO agrega dependencias. Credenciales por env (nunca en codigo):
//   APNS_KEY_ID    = Key ID de la llave (10 chars)
//   APNS_TEAM_ID   = Team ID de la cuenta Apple
//   APNS_P8        = contenido del .p8 (PEM, con -----BEGIN PRIVATE KEY-----)
//   APNS_BUNDLE_ID = bundle de la app (app.gours)
//   APNS_HOST      = api.push.apple.com (prod, default) | api.sandbox.push.apple.com
// Si falta alguna, pushEnabled() = false y mandar push es un no-op (el chat anda igual).
import http2 from 'node:http2';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';

import { query } from '@/lib/db';
import { fcmEnabled, sendFcmToToken } from '@/lib/fcm';

const KEY_ID = process.env.APNS_KEY_ID || '';
const TEAM_ID = process.env.APNS_TEAM_ID || '';
const P8 = (process.env.APNS_P8 || '').replace(/\\n/g, '\n');
const BUNDLE = process.env.APNS_BUNDLE_ID || 'app.gours';
const HOST = process.env.APNS_HOST || 'https://api.push.apple.com';

export function pushEnabled(): boolean {
  return Boolean(KEY_ID && TEAM_ID && P8);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

// El JWT de APNs sirve ~1h; lo cacheamos y regeneramos cada 50 min.
let cachedJwt = '';
let cachedAt = 0;
function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedAt < 50 * 60) return cachedJwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const payload = b64url(JSON.stringify({ iss: TEAM_ID, iat: now }));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(P8);
  const sig = cryptoSign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  cachedJwt = `${signingInput}.${b64url(sig)}`;
  cachedAt = now;
  return cachedJwt;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface SendResult {
  token: string;
  status: number;
  reason?: string;
}

/** Manda la push a UN token por APNs. Reusa un cliente http2 si se pasa. */
function sendToToken(
  client: http2.ClientHttp2Session,
  jwt: string,
  token: string,
  payload: PushPayload,
): Promise<SendResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
      },
      ...(payload.data ?? {}),
    });
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': BUNDLE,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data).reason as string) : undefined;
      } catch {
        reason = data || undefined;
      }
      resolve({ token, status, reason });
    });
    req.on('error', (e) => resolve({ token, status: 0, reason: e.message }));
    req.end(body);
  });
}

/**
 * Manda una push a todos los dispositivos de un usuario. Si APNs dice que un
 * token ya no sirve (410, o BadDeviceToken/Unregistered), lo borra de la base.
 * No-op si APNs no esta configurado. Nunca tira (loguea y sigue).
 */
export async function sendPushToUser(
  userUuid: string,
  payload: PushPayload,
): Promise<void> {
  if (!pushEnabled() && !fcmEnabled()) return;
  let tokens: { token: string; platform: string }[];
  try {
    tokens = await query<{ token: string; platform: string }>(
      `SELECT token, platform FROM ext.device_token WHERE user_uuid = $1`,
      [userUuid],
    );
  } catch (e) {
    console.error('[push] no se pudieron leer tokens:', e);
    return;
  }
  if (tokens.length === 0) return;

  const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  const androidTokens = tokens
    .filter((t) => t.platform === 'android')
    .map((t) => t.token);

  // iOS -> APNs (si esta configurado).
  if (pushEnabled() && iosTokens.length > 0) {
    const jwt = providerToken();
    const client = http2.connect(HOST);
    client.on('error', (e) => console.error('[push] http2 error:', e.message));
    try {
      const results = await Promise.all(
        iosTokens.map((t) => sendToToken(client, jwt, t, payload)),
      );
      for (const r of results) {
        if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') {
          await query(`DELETE FROM ext.device_token WHERE token = $1`, [r.token]).catch(
            () => {},
          );
        } else if (r.status !== 200) {
          console.error(`[push] token ${r.token.slice(0, 8)}... status=${r.status} reason=${r.reason}`);
        }
      }
    } finally {
      client.close();
    }
  }

  // Android -> FCM v1 (si esta configurado).
  if (fcmEnabled() && androidTokens.length > 0) {
    const results = await Promise.all(
      androidTokens.map((t) => sendFcmToToken(t, payload)),
    );
    for (const r of results) {
      if (r.gone) {
        await query(`DELETE FROM ext.device_token WHERE token = $1`, [r.token]).catch(
          () => {},
        );
      } else if (r.status !== 200) {
        console.error(`[fcm] token ${r.token.slice(0, 8)}... status=${r.status} reason=${r.reason}`);
      }
    }
  }
}

/** Manda la misma push a varios usuarios (p.ej. todos los del evento menos el emisor). */
export async function sendPushToUsers(
  userUuids: string[],
  payload: PushPayload,
): Promise<void> {
  if ((!pushEnabled() && !fcmEnabled()) || userUuids.length === 0) return;
  await Promise.all(userUuids.map((u) => sendPushToUser(u, payload)));
}
