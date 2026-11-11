// Traduccion de mensajes de chat con Google Cloud Translation API (v2 REST).
// La API key va por env (GOOGLE_TRANSLATE_API_KEY), nunca en el codigo.
// Si no hay key, degrada a "sin traduccion" (va el texto original).

const KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';

const TARGETS = (process.env.TRANSLATE_LANGS ||
  'en,fr,it,pt,de,ru,ar,hi,cs,he,zh')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function translateOne(
  text: string,
  source: string,
  target: string,
): Promise<string | null> {
  const url =
    `https://translation.googleapis.com/language/translate/v2?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
  });
  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    console.error(
      `[translate] ${source}->${target} HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
    );
    return null;
  }
  const data = (await res.json()) as any;
  return data?.data?.translations?.[0]?.translatedText ?? null;
}

/** Mapa { idioma: texto } con el original + traducciones a los idiomas destino. */
export async function translateMessage(
  text: string,
  sourceLang: string,
): Promise<Record<string, string>> {
  const map: Record<string, string> = { [sourceLang]: text };
  if (!KEY) return map;
  const targets = TARGETS.filter((l) => l && l !== sourceLang);
  await Promise.all(
    targets.map(async (t) => {
      try {
        const tr = await translateOne(text, sourceLang, t);
        if (tr) map[t] = tr;
      } catch {
        // ignora el idioma que falle
      }
    }),
  );
  return map;
}
