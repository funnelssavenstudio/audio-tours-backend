import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { calculatePeriod, getPeriod } from '@/lib/payroll';

export const runtime = 'nodejs';

// Calcula (o recalcula) la liquidacion de una quincena (admin).
export const POST = withRole(
  'administrator',
  async (_request, _user, context) => {
    const { uuid } = await context.params;
    const period = await getPeriod(uuid);
    if (!period) {
      return NextResponse.json(
        { error: 'Periodo no encontrado.' },
        { status: 404 },
      );
    }
    try {
      const items = await calculatePeriod(period);
      return NextResponse.json({ period: { ...period, status: 'calculated' }, items });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se pudo calcular.' },
        { status: 400 },
      );
    }
  },
);
