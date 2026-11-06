import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { listUserAccess } from '@/lib/payments';

// Devuelve los tour_uuid a los que el usuario tiene acceso (comprados).
export const GET = withAuth(async (_request, user) => {
  const tourUuids = await listUserAccess(user.uuid);
  return NextResponse.json({ tour_uuids: tourUuids });
});
