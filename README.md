# Audio Tours NY - Backend nuevo

Servicios backend de los **modulos nuevos** (2da mitad del proyecto): pagos,
chat, panel del guia, alertas con IA, pagos a guias, pipeline de traduccion de
audios. El diseno completo esta en `../docs/PLAN-BACKEND-NUEVO.md`.

## Idea central

- El backend **Rust existente NO se toca**: solo se consume su API.
- Todo lo nuevo se construye aca, con **tablas propias en el schema `ext`** de la
  **misma base PostgreSQL** (sin foreign keys fisicas hacia el schema del Rust).
- El **login se comparte**: se reusa el token (JWT) que emite el Rust. El
  middleware `withAuth` (en `lib/auth.ts`) lo valida.
  - **Opcion B (actual):** valida el token llamando a la API del Rust
    (`GET /user/{uid}`). No necesita el secreto del JWT, asi arrancamos sin
    depender de nadie.
  - **Opcion A (futura):** verificar la firma del JWT localmente (mas rapido),
    cuando tengamos el secreto.

## Stack

Next.js 14 (App Router, route handlers) + TypeScript + `pg` (PostgreSQL).
Pensado para desplegar en **Vercel** (lo stateless). El realtime (chat,
ubicacion en vivo, push de audio) y los workers del pipeline de audio van en un
servicio aparte en DigitalOcean (ver el plan).

## Como correrlo localmente

```bash
cp .env.example .env.local   # completar con los valores reales
npm install
npm run dev                  # http://localhost:3000
```

Variables (`.env.local`):

- `DATABASE_URL`: connection string de la base PostgreSQL (DigitalOcean).
- `RUST_API_URL`: API del backend Rust (prod o staging), para validar el login.

## Endpoints actuales

- `GET /api/health` - salud del servicio (publico).
- `GET /api/me` - devuelve el usuario del token (protegido, plantilla de los
  endpoints nuevos).

## Scripts

- `npm run dev` - desarrollo.
- `npm run build` / `npm start` - produccion.
- `npm run typecheck` - chequeo de tipos sin compilar.

## Estructura

```
app/
  api/
    health/route.ts   endpoint publico de salud
    me/route.ts        endpoint protegido de ejemplo
  layout.tsx, page.tsx
lib/
  auth.ts              middleware withAuth (valida el token del Rust)
  db.ts                pool de PostgreSQL (schema ext)
```

## Proximo

Siguiendo el orden del plan: a partir de estos cimientos, el primer modulo es
**Pagos** (Stripe), que define la tabla `ext.tour_access`.
