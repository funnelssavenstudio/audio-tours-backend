import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ENDPOINT DE DIAGNOSTICO TEMPORAL (se borra despues). Revela si la key de
// Google Translate llega al runtime y la respuesta cruda de la API, para saber
// por que el chat no traduce. No expone la key (solo su largo y prefijo).
export async function GET() {
  const KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';
  const info: Record<string, unknown> = {
    keyPresent: KEY.length > 0,
    keyLen: KEY.length,
    keyPrefix: KEY.slice(0, 6),
    translateLangs: process.env.TRANSLATE_LANGS || '(default)',
  };
  if (!KEY) return NextResponse.json(info);
  try {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'hola mundo',
          source: 'es',
          target: 'en',
          format: 'text',
        }),
      },
    );
    info.status = res.status;
    info.body = (await res.text()).slice(0, 700);
  } catch (e) {
    info.fetchError = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(info);
}
