import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { listGuideEvents } from '@/lib/guide';

export const runtime = 'nodejs';

// Eventos asignados al guia autenticado (para su panel). Solo rol tour_guide.
export const GET = withRole('tour_guide', async (_request, user) => {
  const events = await listGuideEvents(user.uuid);
  return NextResponse.json({ list: events });
});
