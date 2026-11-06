import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { markItemPaid } from '@/lib/payroll';

export const runtime = 'nodejs';

// Marca un item de liquidacion como pagado (admin). El pago real (transferencia)
// es externo; aca se registra.
export const PUT = withRole(
  'administrator',
  async (_request, _user, context) => {
    const { uuid } = await context.params;
    const item = await markItemPaid(uuid);
    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ item });
  },
);
