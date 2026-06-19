# Inspection Platform (MVP)

Multi-discipline property inspection management. Admins/managers schedule and
assign jobs; specialist inspectors (civil, electrical, plumbing, pest) each fill
their own discipline's sections; a bilingual (EN/AR) PDF report is generated and
emailed to the client.

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js (React, TypeScript) — `apps/web` |
| API | NestJS (TypeScript) + Prisma — `apps/api` |
| DB | PostgreSQL |
| Photos & PDFs | MinIO (S3-compatible), presigned links for delivery |
| Queue | Redis + BullMQ (async report generation, 3 retries) |
| Email | Nodemailer → Mailpit in dev (inbox at http://localhost:8025) |
| PDF | Puppeteer HTML→PDF service — `services/pdf` |
| Shared types | `packages/types` (Zod + TS) |
| Mobile | Swift (iOS) + Kotlin (Android), offline-first — separate repos, consume the API's OpenAPI |

The bilingual report design lives in the sibling `report-python/` project and is
the visual spec the PDF worker will reproduce in HTML/CSS.

## Run it — Option A: everything in Docker

```bash
docker compose --profile app up -d --build
# first time only — seed sample data:
docker compose exec api npx prisma db seed
```

Web → http://localhost:3000 · API → http://localhost:4000 (docs at `/docs`).
Migrations run automatically when the `api` container starts.
Stop with `docker compose --profile app down`.

## Run it — Option B: local dev (hot reload)

```bash
cp .env.example .env
npm install

# infra only in Docker:
docker compose up -d postgres minio redis mailpit

npm run db:migrate
npm run db:seed
npm run dev    # web :3000, api :4000, pdf :4100 with hot reload
```

## Tests

```bash
# requires the dev infra (postgres, minio, redis) to be running
npm -w @ip/api run test:e2e
```

Covers: auth (401s, refresh rotation), RBAC, **discipline-ownership**, tenant
isolation, and the **sign-off completion gate**. CI runs the same suite with
service containers (`.github/workflows/ci.yml`).

## Security notes

- Access tokens are short-lived (15 m) with refresh-token rotation (7 d); the
  web client refreshes automatically on 401.
- Rate limiting: 200 req/min global, 10/min on `/auth/login`.
- `helmet` headers; CORS restricted to `WEB_ORIGIN`.
- Replace all `*_SECRET` defaults before deploying anywhere public.

Seed login: `admin@check.test` / `password123`.
**Don't run both modes at once** — they use the same ports (3000/4000/4100).

## Auth

JWT-based. Log in to get a token, then send `Authorization: Bearer <token>`.
All routes except `/health` and `/auth/login` require a token.

```bash
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@check.test","password":"password123"}'
```

Roles: `ADMIN`/`MANAGER` can create/assign; `INSPECTOR` can only edit items of
their **own discipline** (enforced server-side) and sign their own section.
_(Swap this for Clerk/Auth0 later; the guard/claims structure stays the same.)_

## Key API endpoints

```
POST   /auth/login                       # → { accessToken, user }
GET    /auth/me
GET    /health                           # public
GET    /clients              POST /clients
GET    /inspections          POST /inspections          (ADMIN/MANAGER)
GET    /inspections/:id
POST   /inspections/:id/assignments      (ADMIN/MANAGER)  # assign inspector + discipline
PATCH  /items/:itemId                    # inspector edits OWN-discipline item only
POST   /inspections/:id/sign             # inspector signs own section / customer; completes when all signed
POST   /inspections/:id/report?lang=ar   # (stub) enqueue PDF worker
```

## Design decisions baked in

- **Multi-tenant** schema (`tenantId` everywhere); one tenant at launch.
- **Discipline-owned items** → concurrent offline editing is conflict-free.
- **One assignment per discipline**; report completes only when every discipline signs.
- **Templates per inspection-type + discipline + tenant** (seeded with a `pre-purchase` set).

## Next steps

1. Auth (Clerk/Auth0) with tenant + discipline claims; enforce item ownership.
2. Photo upload (presigned MinIO URLs) + server-side resize/EXIF-fix.
3. PDF worker in `services/pdf` (port the report-python design to HTML/CSS).
4. iOS app (offline-first) → then Android.
