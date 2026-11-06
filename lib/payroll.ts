import { query } from '@/lib/db';

export interface GuideRate {
  uuid: string;
  user_uuid: string;
  amount_per_tour: number;
  currency: string;
  valid_from: string;
}

export interface PayrollPeriod {
  uuid: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface PayrollItem {
  uuid: string;
  period_uuid: string;
  user_uuid: string;
  tours_count: number;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  detail: string[];
}

// --- Tarifas de guia ---

export async function listRates(): Promise<GuideRate[]> {
  return query<GuideRate>(
    `SELECT uuid, user_uuid, amount_per_tour, currency, valid_from
     FROM ext.guide_rate
     ORDER BY user_uuid, valid_from DESC`,
  );
}

/** Crea o actualiza la tarifa de un guia para una fecha de vigencia. */
export async function upsertRate(params: {
  userUuid: string;
  amountPerTour: number;
  currency?: string;
  validFrom?: string;
}): Promise<GuideRate> {
  const rows = await query<GuideRate>(
    `INSERT INTO ext.guide_rate (user_uuid, amount_per_tour, currency, valid_from)
     VALUES ($1, $2, COALESCE($3, 'usd'), COALESCE($4::date, CURRENT_DATE))
     ON CONFLICT (user_uuid, valid_from) DO UPDATE SET
       amount_per_tour = EXCLUDED.amount_per_tour,
       currency = EXCLUDED.currency,
       updated_at = now()
     RETURNING uuid, user_uuid, amount_per_tour, currency, valid_from`,
    [
      params.userUuid,
      params.amountPerTour,
      params.currency ?? null,
      params.validFrom ?? null,
    ],
  );
  return rows[0];
}

// --- Periodos (quincenas) ---

export async function createPeriod(
  startDate: string,
  endDate: string,
): Promise<PayrollPeriod> {
  const rows = await query<PayrollPeriod>(
    `INSERT INTO ext.payroll_period (start_date, end_date)
     VALUES ($1::date, $2::date)
     RETURNING uuid, start_date, end_date, status`,
    [startDate, endDate],
  );
  return rows[0];
}

export async function listPeriods(): Promise<PayrollPeriod[]> {
  return query<PayrollPeriod>(
    `SELECT uuid, start_date, end_date, status
     FROM ext.payroll_period
     ORDER BY start_date DESC`,
  );
}

export async function getPeriod(uuid: string): Promise<PayrollPeriod | null> {
  const rows = await query<PayrollPeriod>(
    `SELECT uuid, start_date, end_date, status
     FROM ext.payroll_period WHERE uuid = $1`,
    [uuid],
  );
  return rows[0] ?? null;
}

export async function listItems(periodUuid: string): Promise<PayrollItem[]> {
  return query<PayrollItem>(
    `SELECT uuid, period_uuid, user_uuid, tours_count, amount, currency,
            status, paid_at, detail
     FROM ext.payroll_item
     WHERE period_uuid = $1
     ORDER BY amount DESC`,
    [periodUuid],
  );
}

// --- Calculo de la liquidacion ---

interface FinishedEvent {
  user_uuid: string;
  event_uuid: string;
}

/**
 * Recalcula los items de un periodo: cuenta los eventos FINALIZADOS con guia
 * dentro del rango de fechas (leyendo public.events + public.event_tour_guides
 * del Rust) y aplica la tarifa vigente de cada guia a la fecha de cierre del
 * periodo. Es idempotente: borra los items previos y los regenera. No se puede
 * recalcular un periodo ya pagado.
 */
export async function calculatePeriod(
  period: PayrollPeriod,
): Promise<PayrollItem[]> {
  if (period.status === 'paid') {
    throw new Error('El periodo ya esta pagado; no se puede recalcular.');
  }

  // Recalcular borra y regenera todos los items del periodo. Si alguno ya fue
  // marcado como pagado, recalcular perderia ese registro (paid_at) y el guia
  // podria terminar cobrando dos veces. Por eso no se permite recalcular un
  // periodo que ya tiene pagos; primero hay que crear un periodo nuevo.
  const [{ paid_count }] = await query<{ paid_count: number }>(
    `SELECT COUNT(*)::int AS paid_count
     FROM ext.payroll_item
     WHERE period_uuid = $1 AND status = 'paid'`,
    [period.uuid],
  );
  if (paid_count > 0) {
    throw new Error(
      'El periodo ya tiene items pagados; no se puede recalcular.',
    );
  }

  // Eventos finalizados con guia en el rango (fin inclusive). DISTINCT por si el
  // Rust permitiera filas duplicadas (guia, evento), para no contar dos veces.
  const events = await query<FinishedEvent>(
    `SELECT DISTINCT g.tour_guide_uuid AS user_uuid, e.uuid AS event_uuid
     FROM public.events e
     JOIN public.event_tour_guides g ON g.event_uuid = e.uuid
     WHERE e.progress = 'finished'
       AND e.datetime >= $1::date
       AND e.datetime < ($2::date + INTERVAL '1 day')`,
    [period.start_date, period.end_date],
  );

  // Tarifa vigente por guia a la fecha de cierre del periodo.
  const rates = await query<{
    user_uuid: string;
    amount_per_tour: number;
    currency: string;
  }>(
    `SELECT DISTINCT ON (user_uuid) user_uuid, amount_per_tour, currency
     FROM ext.guide_rate
     WHERE valid_from <= $1::date
     ORDER BY user_uuid, valid_from DESC`,
    [period.end_date],
  );
  const rateByUser = new Map(rates.map((r) => [r.user_uuid, r]));

  // Agrupar eventos por guia.
  const byGuide = new Map<string, string[]>();
  for (const ev of events) {
    const list = byGuide.get(ev.user_uuid) ?? [];
    list.push(ev.event_uuid);
    byGuide.set(ev.user_uuid, list);
  }

  // Regenerar items (idempotente).
  await query(`DELETE FROM ext.payroll_item WHERE period_uuid = $1`, [
    period.uuid,
  ]);

  for (const [userUuid, eventUuids] of byGuide) {
    const rate = rateByUser.get(userUuid);
    const amountPerTour = rate?.amount_per_tour ?? 0;
    const currency = rate?.currency ?? 'usd';
    await query(
      `INSERT INTO ext.payroll_item
         (period_uuid, user_uuid, tours_count, amount, currency, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        period.uuid,
        userUuid,
        eventUuids.length,
        eventUuids.length * amountPerTour,
        currency,
        JSON.stringify(eventUuids),
      ],
    );
  }

  await query(
    `UPDATE ext.payroll_period SET status = 'calculated', updated_at = now()
     WHERE uuid = $1`,
    [period.uuid],
  );

  return listItems(period.uuid);
}

// --- Items ---

export async function markItemPaid(uuid: string): Promise<PayrollItem | null> {
  const rows = await query<PayrollItem>(
    `UPDATE ext.payroll_item
     SET status = 'paid', paid_at = now(), updated_at = now()
     WHERE uuid = $1
     RETURNING uuid, period_uuid, user_uuid, tours_count, amount, currency,
               status, paid_at, detail`,
    [uuid],
  );
  return rows[0] ?? null;
}
