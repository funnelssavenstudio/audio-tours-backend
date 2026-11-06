import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';

// Endpoint protegido de ejemplo: devuelve el usuario del token.
// Sirve de plantilla para todos los endpoints nuevos que requieren login.
export const GET = withAuth(async (_request, user) => {
  return NextResponse.json({ user });
});
