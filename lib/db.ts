import { Pool } from 'pg';

let pool: Pool | undefined;

/**
 * Pool de conexiones a la base PostgreSQL existente (la misma del backend
 * Rust). Las tablas nuevas de los modulos nuevos viven en el schema `ext`
 * (ver docs/PLAN-BACKEND-NUEVO.md). El schema del Rust no se modifica.
 */
export function getPool(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new Error('Falta la variable de entorno DATABASE_URL.');
    }
    // Las bases administradas de DigitalOcean requieren SSL pero usan un CA
    // propio. Las versiones nuevas de `pg` tratan `sslmode=require` como
    // `verify-full` (verifica el CA) y la conexion falla. Por eso sacamos
    // `sslmode` del string y configuramos el SSL a mano: cifrado, sin verificar
    // el CA (rejectUnauthorized: false).
    const url = new URL(raw);
    const useSsl =
      url.searchParams.has('sslmode') ||
      url.hostname.includes('ondigitalocean.com');
    url.searchParams.delete('sslmode');
    const connectionString = url.toString();

    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      // En serverless (Vercel) cada instancia abre su propio pool y DigitalOcean
      // limita las conexiones totales, asi que mantenemos el pool chico y
      // cerramos las conexiones ociosas rapido. Para mas trafico, usar la
      // connection string del "connection pool" (PgBouncer) de DigitalOcean.
      max: 3,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

/** Helper simple para consultas. Devuelve las filas tipadas. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}
