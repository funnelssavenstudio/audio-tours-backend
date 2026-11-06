import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { getPeriod, listItems } from '@/lib/payroll';

export const runtime = 'nodejs';

// Detalle de una quincena con sus items (admin).
export const GET = withRole('administrator', async (_request, _user, context) => {
  const { uuid } = await context.params;
  const period = await getPeriod(uuid);
  if (!period) {
    return NextResponse.json(
      { error: 'Periodo no encontrado.' },
      { status: 404 },
    );
  }
  const items = await listItems(uuid);
  return NextResponse.json({ period, items });
});
