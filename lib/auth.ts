import { NextRequest, NextResponse } from 'next/server';

/** Usuario autenticado, tal como lo devuelve el backend Rust. */
export interface AuthUser {
  uuid: string;
  email?: string;
  name?: string;
  last_name?: string;
  roles?: string[];
  [key: string]: unknown;
}

/** Contexto de ruta de Next.js (trae los params dinamicos, ej. [uuid]). */
export interface RouteContext {
  params: Promise<Record<string, string>>;
}

type RouteHandler = (
  request: NextRequest,
  user: AuthUser,
  context: RouteContext,
) => Promise<NextResponse> | NextResponse;

/**
 * Decodifica el payload de un JWT sin verificar la firma. Solo se usa para
 * leer el id del usuario; la validez real se delega al backend Rust en
 * validateToken(). El id del usuario viene en el claim `uid`.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function getUserId(payload: Record<string, unknown>): string | null {
  // El backend Rust usa el claim `user_uuid`; dejamos fallbacks por si cambia.
  const candidate =
    payload.user_uuid ?? payload.uid ?? payload.uuid ?? payload.sub;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Opcion B del plan: validar el token contra el backend Rust. Si el Rust
 * devuelve el usuario, el token es valido. No necesitamos el secreto del JWT.
 * Mas adelante se puede sumar la Opcion A (verificar la firma localmente) para
 * evitar este ida y vuelta por request.
 */
async function validateToken(
  token: string,
  userId: string,
): Promise<AuthUser | null> {
  // Puede haber mas de un entorno Rust: produccion (el sistema real, admin del
  // panel y usuarios finales) y staging (la app en debug de pruebas). Validamos
  // contra RUST_API_URL primero y, si no valida, contra RUST_API_URL_FALLBACK.
  // Al salir en vivo se puede dejar solo produccion quitando el fallback.
  const bases = [
    process.env.RUST_API_URL,
    process.env.RUST_API_URL_FALLBACK,
  ].filter((b): b is string => typeof b === 'string' && b.length > 0);
  if (bases.length === 0) {
    throw new Error('Falta la variable de entorno RUST_API_URL.');
  }

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      // El backend Rust devuelve { user: {...} } en GET /user/{uuid}.
      const data = (await res.json()) as { user?: AuthUser };
      return (data.user ?? (data as AuthUser)) as AuthUser;
    } catch {
      // Probar el siguiente entorno.
    }
  }
  return null;
}

/**
 * Indica si el usuario tiene un rol dado. El backend Rust puede exponer los
 * roles de varias formas (array de strings, array de objetos con `name`/`role`,
 * o un unico `role`), asi que lo resolvemos de forma defensiva, igual que el id.
 */
export function userHasRole(user: AuthUser, role: string): boolean {
  const raw = user.roles ?? (user as Record<string, unknown>).role;
  const names: string[] = [];

  if (typeof raw === 'string') {
    names.push(raw);
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        names.push(item);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // La tabla `roles` del Rust usa `key` (ej. 'administrator').
        const name = obj.key ?? obj.name ?? obj.role ?? obj.slug;
        if (typeof name === 'string') names.push(name);
      }
    }
  }

  return names.some((name) => name.toLowerCase() === role.toLowerCase());
}

/**
 * Envuelve un route handler para exigir un usuario autenticado.
 * Uso:
 *   export const GET = withAuth(async (request, user) => { ... });
 */
export function withAuth(handler: RouteHandler) {
  return async (
    request: NextRequest,
    context: RouteContext,
  ): Promise<NextResponse> => {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Falta el token de autorizacion.' },
        { status: 401 },
      );
    }

    const payload = decodeJwtPayload(token);
    const userId = payload ? getUserId(payload) : null;
    if (!userId) {
      return NextResponse.json({ error: 'Token invalido.' }, { status: 401 });
    }

    const user = await validateToken(token, userId);
    if (!user) {
      return NextResponse.json(
        { error: 'Token invalido o expirado.' },
        { status: 401 },
      );
    }

    return handler(request, user, context);
  };
}

/**
 * Como withAuth, pero ademas exige que el usuario tenga el rol indicado.
 * Uso:
 *   export const PUT = withRole('tour_guide', async (request, user) => { ... });
 */
export function withRole(role: string, handler: RouteHandler) {
  return withAuth(async (request, user, context) => {
    if (!userHasRole(user, role)) {
      return NextResponse.json(
        { error: 'No tenes permiso para esta accion.' },
        { status: 403 },
      );
    }
    return handler(request, user, context);
  });
}
