import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

import { withAuth, type RouteContext } from '@/lib/auth';
import { query } from '@/lib/db';

// Dibuja el recorrido de un tour cuando el backend Rust NO lo provee
// (/tour/{uuid}/polyline vacio). La app manda los puntos ordenados del tour
// (punto de encuentro + paradas) y acá calculamos la ruta caminando entre ellos
// con OSRM (gratis), devolviendo una polyline codificada POR TRAMO, en el mismo
// formato que el Rust. Se cachea por tour (ext.tour_route) para calcularlo una
// sola vez. Opción A del plan; se puede cambiar OSRM por Google Directions más
// adelante sin tocar la app.

type Pt = [number, number]; // [lng, lat]

// Perfil 'driving' (auto/bus): sirve tanto para tours urbanos a pie como para
// tours intercity en bus (ej. Washington DC, ~380km NY->DC, donde 'foot'
// fallaria en la autopista). La linea igual sigue las calles.
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** Ruta en auto entre 2 puntos; devuelve la polyline codificada o '' si falla. */
async function osrmLeg(a: Pt, b: Pt): Promise<string> {
  const coords = `${a[0]},${a[1]};${b[0]},${b[1]}`;
  try {
    const res = await fetch(`${OSRM}/${coords}?overview=full&geometries=polyline`, {
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: string }[];
    };
    if (data.code !== 'Ok' || !data.routes?.length) return '';
    return data.routes[0].geometry ?? '';
  } catch {
    return '';
  }
}

export const POST = withAuth(async (request, _user, context: RouteContext) => {
  const { uuid } = await context.params;

  let body: { points?: unknown } = {};
  try {
    body = (await request.json()) as { points?: unknown };
  } catch {
    body = {};
  }

  const raw = Array.isArray(body.points) ? body.points : [];
  const points: Pt[] = raw
    .filter(
      (p): p is [number, number] =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === 'number' &&
        typeof p[1] === 'number',
    )
    .map((p) => [p[0], p[1]] as Pt)
    // Límite defensivo (tours muy largos).
    .slice(0, 60);

  if (points.length < 2) {
    return NextResponse.json({ segments: [] });
  }

  const hash = createHash('sha1').update(JSON.stringify(points)).digest('hex');

  await query(`
    CREATE TABLE IF NOT EXISTS ext.tour_route (
      tour_uuid text PRIMARY KEY,
      points_hash text NOT NULL,
      segments jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const cached = await query<{ segments: string[] }>(
    `SELECT segments FROM ext.tour_route WHERE tour_uuid = $1 AND points_hash = $2`,
    [uuid, hash],
  );
  if (cached.length > 0) {
    return NextResponse.json({ segments: cached[0].segments, cached: true });
  }

  // Un tramo por par de puntos consecutivos (igual que el modelo del Rust:
  // encuentro -> parada0, parada0 -> parada1, ...). Secuencial para no castigar
  // al servidor público de OSRM; igual se hace una sola vez y queda cacheado.
  const segments: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(await osrmLeg(points[i], points[i + 1]));
  }

  // Solo cacheamos si al menos un tramo salió bien (si falló todo, no pisamos
  // con algo vacío: la próxima vez se reintenta).
  if (segments.some((s) => s.length > 0)) {
    await query(
      `INSERT INTO ext.tour_route (tour_uuid, points_hash, segments, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (tour_uuid) DO UPDATE
         SET points_hash = EXCLUDED.points_hash,
             segments = EXCLUDED.segments,
             updated_at = now()`,
      [uuid, hash, JSON.stringify(segments)],
    );
  }

  return NextResponse.json({ segments });
});
