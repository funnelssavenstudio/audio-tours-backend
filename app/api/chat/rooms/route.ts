import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { listRooms } from '@/lib/chat';

export const runtime = 'nodejs';

// Lista todas las salas de chat (una por evento), con ultimo mensaje y titulo
// del tour, ordenadas por el ultimo mensaje mas reciente primero (admin).
export const GET = withRole('administrator', async () => {
  const list = await listRooms();
  return NextResponse.json({ list });
});
