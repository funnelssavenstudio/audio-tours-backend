import { NextResponse } from 'next/server';

// Endpoint de salud: sirve para confirmar que el servicio esta vivo.
export async function GET() {
  return NextResponse.json({
    status: 'OK',
    service: 'audio-tours-backend-nuevo',
    time: new Date().toISOString(),
  });
}
