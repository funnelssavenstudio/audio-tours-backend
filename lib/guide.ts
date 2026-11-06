import { query } from '@/lib/db';

export interface GuideProfile {
  uuid: string;
  user_uuid: string;
  bio: string | null;
  photo_media_uuid: string | null;
  languages: string[];
  visible: boolean;
}

/** Datos editables del perfil del guia. */
export interface GuideProfileInput {
  bio?: string | null;
  photo_media_uuid?: string | null;
  languages?: string[];
  visible?: boolean;
}

/** Devuelve el perfil del guia por su user_uuid, o null si no existe. */
export async function getGuideProfile(
  userUuid: string,
): Promise<GuideProfile | null> {
  const rows = await query<GuideProfile>(
    `SELECT uuid, user_uuid, bio, photo_media_uuid, languages, visible
     FROM ext.guide_profile
     WHERE user_uuid = $1`,
    [userUuid],
  );
  return rows[0] ?? null;
}

/**
 * Crea o actualiza el perfil del guia (upsert por user_uuid). Solo pisa los
 * campos que vienen definidos en `input`; deja el resto como estaba usando el
 * valor actual via COALESCE. Devuelve el perfil resultante.
 */
export async function upsertGuideProfile(
  userUuid: string,
  input: GuideProfileInput,
): Promise<GuideProfile> {
  const rows = await query<GuideProfile>(
    `INSERT INTO ext.guide_profile
       (user_uuid, bio, photo_media_uuid, languages, visible)
     VALUES ($1, $2, $3, COALESCE($4::text[], '{}'::text[]), COALESCE($5, true))
     ON CONFLICT (user_uuid) DO UPDATE SET
       bio              = COALESCE($2, ext.guide_profile.bio),
       photo_media_uuid = COALESCE($3, ext.guide_profile.photo_media_uuid),
       languages        = COALESCE($4::text[], ext.guide_profile.languages),
       visible          = COALESCE($5, ext.guide_profile.visible),
       updated_at       = now()
     RETURNING uuid, user_uuid, bio, photo_media_uuid, languages, visible`,
    [
      userUuid,
      input.bio ?? null,
      input.photo_media_uuid ?? null,
      input.languages ?? null,
      input.visible ?? null,
    ],
  );
  return rows[0];
}

/** Foto del perfil del guia, tal como se guarda en ext.guide_photo. */
export interface GuidePhoto {
  content_type: string;
  bytes: Buffer;
}

/**
 * Crea o actualiza la foto del guia (upsert por user_uuid). Guarda los bytes
 * crudos y el content-type (image/jpeg o image/png).
 */
export async function setGuidePhoto(
  userUuid: string,
  contentType: string,
  buffer: Buffer,
): Promise<void> {
  await query(
    `INSERT INTO ext.guide_photo (user_uuid, content_type, bytes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_uuid) DO UPDATE SET
       content_type = $2,
       bytes        = $3,
       updated_at   = now()`,
    [userUuid, contentType, buffer],
  );
}

/** Devuelve la foto del guia por su user_uuid, o null si no tiene. */
export async function getGuidePhoto(
  userUuid: string,
): Promise<GuidePhoto | null> {
  const rows = await query<GuidePhoto>(
    `SELECT content_type, bytes
     FROM ext.guide_photo
     WHERE user_uuid = $1`,
    [userUuid],
  );
  return rows[0] ?? null;
}

export interface GuideEvent {
  uuid: string;
  tour_uuid: string;
  datetime: string;
  status: string;
  progress: string;
  title: string | null;
}

/**
 * Lista los eventos asignados a un guia (leyendo public.events +
 * public.event_tour_guides del Rust). Incluye el titulo del tour (best-effort,
 * cualquier traduccion disponible). Solo lo del guia autenticado.
 */
export async function listGuideEvents(userUuid: string): Promise<GuideEvent[]> {
  return query<GuideEvent>(
    `SELECT e.uuid,
            e.tour_uuid,
            e.datetime,
            e.status::text   AS status,
            e.progress::text AS progress,
            (SELECT tt.title FROM public.tour_translations tt
              WHERE tt.tour_uuid = e.tour_uuid
              ORDER BY tt.created_at LIMIT 1) AS title
     FROM public.events e
     JOIN public.event_tour_guides g ON g.event_uuid = e.uuid
     WHERE g.tour_guide_uuid = $1
     ORDER BY e.datetime DESC`,
    [userUuid],
  );
}
