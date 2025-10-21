# LMS Backend (LoopBack 4)

A multi-tenant learning management system backend built with LoopBack 4. The service powers course planning, CMS content, user and tenant settings, and upcoming commerce features. The codebase emphasizes tenant isolation, auditable settings changes, and modular service design.

## Key Features

- **Multi-tenant architecture** with per-request tenant context, isolated MongoDB databases, and tenant-aware repositories.
- **Authentication & Authorization** via JWT, refresh tokens, and role-based access control (`tenantAdmin`, `instructor`, `student`).
- **CMS content management** including revision history, preview tokens, and published content queries for tenant public sites.
- **User settings** endpoints for profile, notifications, and password updates.
- **Tenant settings** service for branding/contact info and Dropbox integration scaffolding.
- **Session planner** covering scheduling, attendance tracking, and reminder workflows.
- **Logging & observability** through Pino logger, correlation IDs, and request middleware.

## Getting Started

### Prerequisites

- Node.js 20.x or newer (supports 22 & 24 as well)
- MongoDB instance (local or hosted)
- Optional: Docker & Docker Compose

### Installation

```bash
npm install
```

Copy environment template and adjust values:

```bash
cp .env.example .env
# update JWT secrets, Mongo URL, Stripe keys, etc.
```

### Running Locally

```bash
npm start
# or hot reload for development
echo "Remember to run build once before watch" && npm run build && npm run build:watch
```

By default the API listens on `http://127.0.0.1:3000`. Explore routes via `/explorer` once authenticated.

### Tenant Configuration

- Set `MONGODB_URL` in `.env` (e.g. `mongodb://root:root123@localhost:27017/lmsdb?authSource=admin`).
- Optionally change per-tenant DB prefix via `TENANT_DB_PREFIX` (default `tenant`).
- Every authenticated request **must** include `x-tenant-id`; connections are cached and named `<prefix>_<tenantId>`.

### Authentication Flow

1. Obtain a JWT via `POST /auth/login` (requires tenant header).
2. Include `Authorization: Bearer <token>` and `x-tenant-id` on all tenant routes.
3. Refresh tokens (if enabled) are issued via `POST /auth/refresh`.

### Common Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm run build:watch` | Rebuild on file changes (development). |
| `npm run start` | Start API (runs `npm run rebuild` first). |
| `npm run lint` / `npm run lint:fix` | ESLint + Prettier checks/fixes. |
| `npm run migrate` | Run auto-migration against tenant databases. |
| `npm run openapi-spec` | Export OpenAPI document from compiled output. |
| `npm test` | Execute unit/acceptance test suite. |
| `npm run docker:build` / `docker:run` | Build and run containerized service. |

## Project Layout

```
src/
  application.ts           # LoopBack application setup & bindings
  controllers/             # REST controllers (auth, CMS, settings, planner, etc.)
  models/                  # Data models with tenant/user/course schemas
  repositories/            # CRUD repositories with relations & inclusion resolvers
  services/                # Domain services (CMS, settings, attendance, reminders)
  middleware/              # Request logging, tenant context extraction
  utils/                   # Helper utilities (tenant IDs, commission calc)
  __tests__/               # Acceptance tests scaffolding
public/                    # Static assets for default landing
```

## CMS Content APIs

- `POST /tenant/cms` create draft content.
- `PATCH /tenant/cms/{id}` update draft and bump revision.
- `POST /tenant/cms/{id}/publish` mark content as published or scheduled.
- `GET /tenant/public/cms` fetch published content for public site intake.
- Revisions stored in `cms-content-revision` collection with audit metadata.

## User & Tenant Settings

- User profile endpoints under `/tenant/me/*` for profile, notification, and password management.
- Tenant settings service (controller forthcoming) updates branding, contact info, billing metadata, and Dropbox app credentials.
- Services enforce tenant ownership and log activity via Pino.

## Session Planner

- `/tenant/courses/{courseId}/sessions` CRUD to manage course sessions (live/recorded).
- Attendance service captures present/absent counts and updates session aggregates.
- Reminder service schedules notifications and tracks delivery state.

## Roadmap

1. Integrate Dropbox file uploads for course/module/chapter attachments.
2. Implement order management & payment reconciliation.
3. Tenant earnings dashboards and analytics.
4. Public host → tenant resolver API for multi-domain routing.

## Deployment Notes

- Configure environment variables (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `STRIPE_SECRET_KEY`, etc.).
- Use Dockerfile provided or deploy Node service behind reverse proxy (ensure forwarding of `x-tenant-id`).
- Consider centralized logging (Pino supports transports) and metrics instrumentation.

## Contributing

1. Fork & clone repository.
2. Create feature branch.
3. Run `npm run lint` and `npm test` before pushing.
4. Submit PR describing tenant impact and required migrations.

## License

This project is currently private. Contact the maintainer for licensing details.
