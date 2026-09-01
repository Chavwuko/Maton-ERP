# ERP Foundations

[![CI](https://github.com/Chavwuko/Maton-ERP/actions/workflows/ci.yml/badge.svg)](https://github.com/Chavwuko/Maton-ERP/actions/workflows/ci.yml)

Core platform for the multi-department ERP: authentication, the shared data
model, and base AWS infrastructure. Every future module (Document Control,
Heavy-Duty Maintenance, Project Control, HSE, Inventory, Accounting, HR)
builds on top of what's in this repo rather than re-implementing auth,
tenancy, or the org/department/project/asset model from scratch.

## Structure

```
erp-foundations/
├── infra/               Terraform for AWS (VPC, RDS, ECS Fargate, Cognito, S3, ECR)
├── frontend/            React + TypeScript + Vite SPA — see "Frontend" below
└── backend/             NestJS API
    ├── prisma/           Schema + seed script (source of truth for the DB)
    ├── test/             e2e test suite (one spec file per module) — see Testing below
    └── src/
        ├── auth/         Cognito JWT guard, RBAC guard/decorator, @Public()
        ├── database/     PrismaService, wired up as a global module
        ├── storage/       StorageService wrapping the S3 documents bucket,
        │                 wired up as a global module (any module can inject it)
        ├── health/       ALB health check endpoint
        └── modules/
            ├── organizations/      Reference implementation — copy this
            │                       folder's shape for new feature modules
            ├── departments/        CRUD nested under Organization (rename via PATCH)
            ├── document-control/   Versioned documents + draft → review →
            │                       approval workflow, files in S3/MinIO
            ├── projects/           Project CRUD, status workflow, milestones
            ├── assets/             Equipment/vehicle/facility registry
            ├── maintenance/        Work orders against an asset (CMMS)
            ├── inventory/          Warehouses, parts catalog, stock ledger
            ├── accounting/         Vendors, invoices (AP/AR), payments
            ├── hse/                Incident reporting + corrective actions
            └── hr/                 Employees, self-service docs, 360 appraisals
```

## How authentication works

1. Users authenticate against the Cognito Hosted UI (`cognito_hosted_ui_domain`
   output) and receive a JWT access token.
2. Every API request sends `Authorization: Bearer <token>`.
3. `CognitoAuthGuard` (applied globally via `AuthModule`) verifies the token
   against the Cognito public keys, then looks up or lazily creates the
   matching row in the local `users` table.
4. `RolesGuard` (also global) checks `@Roles('admin', 'maintenance')` on the
   route, if present, against the user's `Role.name`. Role names must match
   Cognito group names — see `department_seed_roles` in
   `infra/variables.tf` and `backend/prisma/seed.ts`.
5. Routes that should skip auth entirely (currently only `/health`) are
   marked `@Public()`.

## Data model

See `backend/prisma/schema.prisma`. The four models every module should
reference:

- **Department** — org unit a user belongs to
- **Project** — anchor for Project Control; HSE incidents, Maintenance work
  orders, and Accounting invoices can all point back to a project
- **Asset** — anchor for the Maintenance/CMMS module; can optionally be
  tied to the project it's currently deployed on
- **AuditLog** — generic audit trail; write here on create/update/delete of
  significant records instead of building per-module logging

Document Control adds `Document` / `DocumentVersion` / `DocumentApproval` —
see `backend/src/modules/document-control/` below. The `Document` →
`DocumentVersion` → S3-key convention it uses is meant to be copied by any
future module that needs versioned file attachments (Maintenance work order
photos, HSE incident evidence, etc.), rather than each module inventing its
own file storage pattern.

Project Control adds `ProjectMilestone`, and gives `Document` an optional
`projectId` so a project's contracts/permits/drawings can be listed via
`GET /documents?projectId=...` without a separate join table.

Maintenance adds `WorkOrder` against `Asset`, and gives `Document` an
optional `workOrderId` for the same reason (photos, completion reports).
Progressing a work order also keeps `Asset.status` truthful automatically —
see the Maintenance module section below.

Inventory adds `Warehouse`, `InventoryItem`, `StockLevel` (a running balance
per item/warehouse), and `StockTransaction` (the immutable ledger every
balance change is derived from) — see the Inventory module section below
for the rule that keeps the ledger and the balance from drifting apart.

Accounting adds `Vendor`, `Invoice` (payable or receivable), and `Payment`,
and gives `Document` an optional `invoiceId` for attaching the invoice
PDF/receiving document. An invoice's remaining balance (`total` minus the
sum of its `Payment`s) is always derived, never stored — see the Accounting
module section below for the approve → pay workflow.

HSE adds `Incident` and `CorrectiveAction`, and gives `Document` an optional
`incidentId` for attaching scene photos/reports. An incident can only reach
`CLOSED` once every one of its `CorrectiveAction`s is `COMPLETED` — see the
HSE module section below.

HR adds `Employee` (a 1:1 HR extension of `User` — job title, hire date,
employment status, manager — kept separate from the core `User` model used
by auth), `AppraisalCycle`, `Appraisal`, and `AppraisalReviewer` for 360°
reviews, and gives `Document` an optional `employeeId` for employee
self-service uploads. See the HR module section below.

## Document Control module

Versioned documents with a draft → review → approval workflow, backed by the
S3 bucket from `infra/storage.tf` (MinIO locally — see below).

- `POST /documents` (multipart: `file`, `organizationId`, `title`,
  `departmentId?`, `description?`, `category?`) — creates the document and
  its first version (status `DRAFT`).
- `GET /documents` (query: `organizationId?`, `status?`, `departmentId?`) —
  list, each with its latest version.
- `GET /documents/:id` — detail with full version + approval history.
- `POST /documents/:id/versions` (multipart: `file`) — uploads a new
  revision; resets status to `DRAFT` since a new revision needs re-approval.
- `GET /documents/:id/versions/:versionId/download` — returns a short-lived
  presigned S3 URL for that specific version's file.
- `POST /documents/:id/submit` (body: `{ reviewerIds: string[] }`) — moves
  `DRAFT`/`REJECTED` → `IN_REVIEW` and opens a pending approval per reviewer
  on the current version. Each `reviewerId` must belong to a user with the
  `document_control` or `admin` role, or the whole submission is rejected
  with a 400.
- `POST /documents/:id/review` (body: `{ status: "APPROVED"|"REJECTED",
  comment? }`) — records the calling user's decision. A `REJECTED` decision
  moves the document to `REJECTED` immediately; the document only becomes
  `APPROVED` once every assigned reviewer on that version has approved.
  Only a user with a pending approval row on the current version can call
  this — it's checked in `DocumentControlService`, not via `@Roles(...)`,
  since who can approve a document is per-document, not per-role.

## Project Control module

Project CRUD with a guarded status workflow, plus milestones.

- `POST /projects` (body: `organizationId`, `code`, `name`, `startDate?`,
  `endDate?`, `budget?`) — restricted to `admin`/`project_control`. `code`
  must be unique within the organization (409 on conflict).
- `GET /projects` (query: `organizationId?`, `status?`) — list.
- `GET /projects/:id` — detail with milestones and linked documents.
- `PATCH /projects/:id/status` (body: `{ status }`) — restricted to
  `admin`/`project_control`. Only these transitions are allowed: `PLANNED`
  → `ACTIVE`/`CLOSED`; `ACTIVE` → `ON_HOLD`/`CLOSED`; `ON_HOLD` →
  `ACTIVE`/`CLOSED`. `CLOSED` is terminal — a 400 explains the allowed
  transitions on any other request.
- `GET /projects/:id/milestones` — list.
- `POST /projects/:id/milestones` (body: `name`, `dueDate`, `description?`)
  — restricted to `admin`/`project_control`.
- `PATCH /projects/:id/milestones/:milestoneId` (body: `status?`, `name?`,
  `description?`, `dueDate?`) — restricted to `admin`/`project_control`.
  Setting `status: "COMPLETED"` stamps `completedAt`; setting any other
  status clears it.

To attach a document to a project, pass `projectId` in the `POST /documents`
multipart body (Document Control), then filter with
`GET /documents?projectId=...`.

## Assets module

Minimal equipment/vehicle/facility registry — the anchor Maintenance work
orders point at.

- `POST /assets` (body: `organizationId`, `assetTag`, `name`, `category`,
  `projectId?`, `location?`) — restricted to `admin`/`maintenance`.
  `assetTag` must be unique within the organization (409 on conflict).
- `GET /assets` (query: `organizationId?`, `status?`, `projectId?`) — list.
- `GET /assets/:id` — detail with its work order history.

## Maintenance module

Work orders (CMMS) against an `Asset`, with a guarded status workflow that
keeps the asset's own status in sync automatically.

- `POST /work-orders` (body: `organizationId`, `assetId`, `title`,
  `description?`, `type?` (`CORRECTIVE`/`PREVENTIVE`, default
  `CORRECTIVE`), `priority?` (default `MEDIUM`), `dueDate?`,
  `assignedToId?`) — open to any authenticated user, since a fault can be
  reported by anyone (same asymmetry as Document Control's open create).
  Rejected with 400 if the asset is `DECOMMISSIONED`.
- `GET /work-orders` (query: `organizationId?`, `assetId?`, `status?`,
  `type?`, `priority?`) — list.
- `GET /work-orders/:id` — detail with linked documents.
- `PATCH /work-orders/:id/assign` (body: `{ assignedToId }`) — restricted
  to `admin`/`maintenance`.
- `PATCH /work-orders/:id/status` (body: `{ status }`) — restricted to
  `admin`/`maintenance`. Allowed transitions: `OPEN` →
  `IN_PROGRESS`/`ON_HOLD`/`CANCELLED`; `IN_PROGRESS` →
  `ON_HOLD`/`COMPLETED`/`CANCELLED`; `ON_HOLD` →
  `IN_PROGRESS`/`CANCELLED`. `COMPLETED`/`CANCELLED` are terminal.
  Moving a work order to `IN_PROGRESS` sets its asset to
  `UNDER_MAINTENANCE`; moving it to `COMPLETED`/`CANCELLED` sets the asset
  back to `ACTIVE` only once no other work order against it is still
  `OPEN`/`IN_PROGRESS`/`ON_HOLD`.

To attach a document (photo, completion report) to a work order, pass
`workOrderId` in the `POST /documents` multipart body, then filter with
`GET /documents?workOrderId=...`.

## Inventory module

Warehouses, a parts/consumables catalog, and a stock ledger. Every mutating
endpoint is restricted to `admin`/`inventory` since these change quantities
other people rely on being accurate; reads are open to any authenticated
user.

- `POST /warehouses` (body: `organizationId`, `code`, `name`, `location?`)
  — `code` must be unique within the organization (409 on conflict).
- `GET /warehouses`, `GET /warehouses/:id` (detail includes stock levels).
- `POST /inventory-items` (body: `organizationId`, `sku`, `name`,
  `unitOfMeasure`, `description?`, `reorderPoint?`, `reorderQuantity?`) —
  `sku` must be unique within the organization (409 on conflict).
- `GET /inventory-items` (query: `organizationId?`,
  `belowReorderPoint=true`) — the reorder filter sums each item's stock
  across all warehouses and only returns items with a `reorderPoint` set
  whose total is under it.
- `GET /inventory-items/:id` — detail with per-warehouse stock levels.
- `POST /stock-transactions` (body: `itemId`, `warehouseId`, `type`
  (`RECEIPT`/`ISSUE`/`ADJUSTMENT`), `quantity`, `notes?`, `workOrderId?`) —
  records one ledger entry and updates the running balance in the same
  transaction. `quantity` is a positive count for `RECEIPT`/`ISSUE`; for
  `ADJUSTMENT` it's a signed delta (positive corrects a shortfall, negative
  corrects an excess). Anything that would take a balance negative is
  rejected with 400 naming the current balance. Pass `workOrderId` to link
  a parts issue to the work order that consumed it.
- `POST /stock-transactions/transfer` (body: `itemId`, `fromWarehouseId`,
  `toWarehouseId`, `quantity`) — moves stock between warehouses as one
  atomic pair of ledger rows (same insufficient-stock guard on the source).
- `GET /stock-transactions` (query: `itemId?`, `warehouseId?`,
  `workOrderId?`) — the ledger, newest first.

`StockLevel.quantityOnHand` is a denormalized cache of the `StockTransaction`
ledger, kept in sync by `InventoryService`'s private `applyStockDelta` —
never write it directly from a new endpoint; go through
`recordTransaction`/`transfer` (or extend them) so the two can't drift.

## Accounting module

Vendors, invoices (accounts payable or receivable), and payments against
them. Every mutating endpoint is restricted to `admin`/`finance`; reads are
open to any authenticated user.

- `POST /vendors` (body: `organizationId`, `name`, `contactEmail?`,
  `contactPhone?`) — `name` must be unique within the organization (409 on
  conflict).
- `GET /vendors`, `GET /vendors/:id` (detail includes its invoices).
- `POST /invoices` (body: `organizationId`, `type` (`PAYABLE`/
  `RECEIVABLE`), `invoiceNumber`, `subtotal`, `tax?`, `projectId?`,
  `vendorId?`, `customerName?`, `issueDate?`, `dueDate?`) — `vendorId` is
  required for `PAYABLE`, `customerName` for `RECEIVABLE` (400 either way if
  missing). `total` is always computed server-side as `subtotal + tax`,
  never trusted from the client. `invoiceNumber` must be unique within the
  organization (409 on conflict). Starts in `DRAFT`.
- `GET /invoices` (query: `organizationId?`, `projectId?`, `vendorId?`,
  `status?`, `type?`) — list.
- `GET /invoices/:id` — detail with payment history and linked documents.
- `PATCH /invoices/:id/status` (body: `{ status: "APPROVED"|"VOID" }`) —
  `DRAFT` → `APPROVED`/`VOID`; `APPROVED` → `VOID`. `PAID` is deliberately
  unreachable through this endpoint — see below. `APPROVED`/`VOID` requests
  outside these edges get a 400 explaining what's allowed; `PAID`/`VOID` are
  terminal.
- `POST /invoices/:id/payments` (body: `amount`, `method?`, `reference?`) —
  only legal while the invoice is `APPROVED`. Rejected with 400 if `amount`
  would exceed the remaining balance (`total` minus payments so far, naming
  both figures). Once a payment brings the remaining balance to exactly
  zero, the invoice automatically flips to `PAID` — the same
  "children drive the parent's state" pattern Document Control uses for
  multi-reviewer approval.

To attach a document (invoice PDF, receiving slip) to an invoice, pass
`invoiceId` in the `POST /documents` multipart body, then filter with
`GET /documents?invoiceId=...`.

## HSE module

Incident reporting with a guarded investigation workflow.

- `POST /incidents` (body: `organizationId`, `title`, `type`
  (`INJURY`/`NEAR_MISS`/`ENVIRONMENTAL`/`PROPERTY_DAMAGE`/`SECURITY`),
  `severity` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), `occurredAt`,
  `description?`, `projectId?`, `assetId?`, `location?`) — open to any
  authenticated user; safety reporting should never be gated behind a role
  (same reasoning as Maintenance's open work-order creation). Starts in
  `REPORTED`.
- `GET /incidents` (query: `organizationId?`, `status?`, `type?`,
  `severity?`, `projectId?`, `assetId?`) — list.
- `GET /incidents/:id` — detail with corrective actions and linked
  documents.
- `PATCH /incidents/:id/status` (body: `{ status }`) — restricted to
  `admin`/`hse`. Allowed transitions: `REPORTED` →
  `UNDER_INVESTIGATION`/`CLOSED` (a minor report can close directly, no
  investigation required); `UNDER_INVESTIGATION` →
  `CORRECTIVE_ACTION`/`CLOSED`; `CORRECTIVE_ACTION` → `CLOSED`. `CLOSED` is
  terminal. Moving to `CLOSED` is rejected with 400 (naming how many are
  outstanding) if any `CorrectiveAction` on the incident isn't yet
  `COMPLETED`.
- `GET /incidents/:id/corrective-actions` — list.
- `POST /incidents/:id/corrective-actions` (body: `description`,
  `assignedToId`, `dueDate`) — restricted to `admin`/`hse`.
- `PATCH /incidents/:id/corrective-actions/:actionId` (body: `status?`,
  `description?`, `assignedToId?`, `dueDate?`) — restricted to
  `admin`/`hse`. Setting `status: "COMPLETED"` stamps `completedAt`;
  setting any other status clears it.

To attach a document (scene photo, investigation report) to an incident,
pass `incidentId` in the `POST /documents` multipart body, then filter with
`GET /documents?incidentId=...`.

## HR module

Employee records with self-service document submission, and 360-degree
appraisals.

**Employees** — reads are open to any authenticated user (an org
directory); creating a record or changing employment status is restricted
to `admin`/`hr`.

- `POST /employees` (body: `organizationId`, `userId`, `employeeNumber`,
  `jobTitle`, `hireDate`, `managerId?`) — `userId` must not already have an
  employee record, `employeeNumber` must be unique within the organization
  (409 either way, with a distinct message so the client knows which).
- `GET /employees` (query: `organizationId?`, `employmentStatus?`,
  `managerId?`) — list.
- `GET /employees/:id` — detail with manager and direct reports.
- `PATCH /employees/:id/status` (body: `{ employmentStatus }`) —
  `ACTIVE`/`ON_LEAVE` are freely interchangeable; `TERMINATED` is terminal
  (400 on any further change — rehire by creating a new employee record).
- `GET /employees/:id/documents` — restricted to `admin`/`hr` (an
  employee's HR documents can be sensitive).

**Self-service** — every employee's own surface, resolved from the calling
user's own `Employee` record (404 if they don't have one). No `@Roles(...)`
needed since the record is always the caller's own:

- `GET /employees/me` — my own employee record.
- `GET /employees/me/documents` — my own submitted documents.
- `POST /employees/me/documents` (multipart: `file`, `title`, `category?`,
  `description?`) — uploads through `DocumentControlService` with
  `employeeId`/`organizationId` set from my own record, `ownerId` from my
  own user id. This is the "every employee can submit their documents"
  feature — nothing but the file and a title is required from the caller.

**360° appraisals** — a cycle (`AppraisalCycle`) holds one `Appraisal` per
employee under review; each `Appraisal` gathers feedback from several
`AppraisalReviewer` rows (self, manager, peers, subordinates — any mix,
any count ≥ 1).

- `POST /appraisal-cycles` (body: `organizationId`, `name`, `startDate`,
  `endDate`) — restricted to `admin`/`hr`. Starts `DRAFT`.
- `GET /appraisal-cycles`, `GET /appraisal-cycles/:id` (detail includes its
  appraisals).
- `PATCH /appraisal-cycles/:id/status` (body: `{ status }`) — restricted to
  `admin`/`hr`. `DRAFT` → `ACTIVE`/`CLOSED`; `ACTIVE` → `CLOSED`. Moving to
  `CLOSED` is rejected with 400 (naming how many are outstanding) if any
  `Appraisal` in the cycle isn't yet `COMPLETED`.
- `POST /appraisal-cycles/:id/appraisals` (body: `employeeId`, `reviewers:
  [{ employeeId, relationType }]` where `relationType` is
  `SELF`/`MANAGER`/`PEER`/`SUBORDINATE`) — restricted to `admin`/`hr`.
  Creates the `Appraisal` plus one `PENDING` `AppraisalReviewer` row per
  entry in one shot. 409 if this employee already has an appraisal in this
  cycle.
- `GET /appraisals` (query: `organizationId?`, `cycleId?`, `employeeId?`,
  `status?`), `GET /appraisals/:id` (detail includes every reviewer row and
  its rating/comments).
- `POST /appraisals/:id/reviews` (body: `rating` (integer 1–5),
  `comments?`) — open to any authenticated user; authorization is
  data-driven, not role-based: the caller's own `Employee` record must have
  a `PENDING` `AppraisalReviewer` row on this appraisal (403 if not
  assigned, 400 if already submitted). Once every reviewer has submitted,
  the appraisal automatically flips to `COMPLETED` and `overallRating` is
  set to the average of all ratings — the same "children drive the
  parent's state" pattern used throughout this codebase (Document Control's
  approvals, Accounting's payments, HSE's corrective actions). Before that,
  it's `IN_PROGRESS` once at least one review is in.

## Adding a new module

1. `backend/src/modules/<name>/` with its own `.module.ts`, `.controller.ts`,
   `.service.ts`, and `dto/` — copy `organizations/` as a template.
2. Add any new Prisma models to `schema.prisma`, referencing `Department`,
   `Project`, or `Asset` by foreign key rather than duplicating fields.
3. Run `npm run prisma:migrate:dev` to generate a migration.
4. Register the module in `AppModule.imports`.
5. Add `@Roles(...)` to controller routes that need restricting beyond
   "any authenticated user."
6. Add `src/modules/<name>/<name>.service.spec.ts` (unit, mocked
   `PrismaService` via `test/utils/mock-prisma.ts`), `<name>.controller.spec.ts`
   (unit, hand-mocked service via `test/utils/mock-request.ts` for `req.user`)
   if the controller does more than trivial delegation, and
   `backend/test/<name>.e2e-spec.ts` (e2e, real DB) covering the happy path
   plus every guard/validation the service enforces — copy an existing
   trio's shape (e.g. `projects.*` for a module with a status workflow,
   `hse.*` for one with a "children complete before the parent can close"
   rule). See Testing below.

## Local development (fully local, no AWS account needed)

This runs the backend against a local Postgres and a local MinIO (S3-compatible
storage, for Document Control) in Docker, and skips Cognito entirely using a
local-dev auth stand-in — good for trying things out before spending
anything on AWS.

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
and [Node.js](https://nodejs.org/) (v20+) installed.

```bash
# From the repo root: start a local Postgres in the background
docker compose up -d

# Then set up and run the backend
cd backend
cp .env.local.example .env
npm install
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

Visit `http://localhost:3000/health` in a browser — you should see
`{"status":"ok",...}`. Try `http://localhost:3000/organizations` too (an
empty array `[]` is expected until you create one). The MinIO web console
is at `http://localhost:9001` (login `minioadmin` / `minioadmin`) if you
want to see uploaded document files directly.

By default every request is treated as an "admin" user — no login step
needed. To test as a different role, send the header `x-local-role: hse`
(or any role name) instead. **This mode is for your own PC only** — never
deploy with `AUTH_MODE=local` set anywhere reachable from the internet.

To stop and remove the local database: `docker compose down` (add `-v` to
also delete its data).

### Fully containerized (backend included)

The steps above run Postgres/MinIO in Docker but the backend itself as a
dev server on your machine. To run the backend containerized too — the
same image `infra/ecs.tf` deploys to AWS, not a dev-only setup — skip the
`cd backend` steps entirely:

```bash
docker compose up --build -d
```

This builds the backend image, applies pending Prisma migrations and seeds
roles via a one-shot `migrate` service, then starts the API — `postgres`,
`minio`, and `backend` all restart automatically (`restart: unless-stopped`)
if Docker or the machine restarts. Visit `http://localhost:3000/health` the
same as above. `docker compose logs -f backend` follows its output; `docker
compose down` stops everything (`up -d` again picks up right where it left
off, since Postgres/MinIO data lives in named volumes).

Rebuild after changing backend source with `docker compose up --build -d
backend` — Docker only re-runs `npm run build` and later layers if `npm ci`'s
inputs (`package.json`/`package-lock.json`) haven't changed, so this is fast
after the first build.

## Frontend

React + TypeScript + Vite SPA in `frontend/`, talking to the backend over
plain `fetch` (CORS is wide open via `app.enableCors()` in
`backend/src/main.ts`, so no proxy is needed for local dev). Stack:
`react-router-dom` for routing, `@tanstack/react-query` for server-state
caching, and Mantine (`@mantine/core`/`form`/`notifications`) for UI.

**Only Organizations + Departments have a UI so far** — one full module
(list → detail → create → update, RBAC-aware) built end-to-end as the
template to copy for the rest. The nav sidebar lists every other module as
"Coming soon" so the UI itself doubles as a visible roadmap; flip an item
over to a real route as its module gets built.

There's no real login yet: instead of wiring Cognito's OAuth flow this
early, the header has an "Acting as" role switcher that sends whatever role
you pick as the `x-local-role` header on every request — the same
mechanism `AUTH_MODE=local` uses on the backend (see `LocalDevAuthGuard`).
Switching roles invalidates every cached query, so RBAC-gated buttons
(e.g. "New department" only shows for `admin`) update immediately.

```bash
# Backend must already be reachable at localhost:3000 (either
# `npm run start:dev` or the fully-containerized `docker compose up -d`
# from Local development above)

cd frontend
cp .env.example .env   # VITE_API_BASE_URL — defaults to http://localhost:3000
npm install
npm run dev
```

Visit `http://localhost:5173`. `npm run build` produces a static
`dist/` bundle (typechecked via `tsc -b` first); there's no server-side
rendering, so it can be hosted from any static file host once there's
somewhere to point it at.

**Adding the next module's UI**: copy `src/modules/organizations/`'s
shape — `src/api/<module>.ts` for typed request functions, a
`<Module>ListPage.tsx` and (if it has a workflow) a
`<Module>DetailPage.tsx` using `useQuery`/`useMutation`, gate
mutation-triggering buttons on `useRole()` matching the backend's
`@Roles(...)` on that route, then flip its `AppNav` entry over to a `path`
and add the route in `App.tsx`. Copy `OrganizationsListPage.test.tsx`'s
shape for its tests too — see below.

### Frontend tests (`npm test`)

Vitest + `@testing-library/react`, run from `frontend/`:

```bash
cd frontend
npm test          # run once (this is also what CI runs)
npm run test:watch
```

`roleStore.test.ts`/`client.test.ts` unit-test the pure logic (localStorage
persistence, request/error handling — `fetch` is mocked, no backend
needed). `OrganizationsListPage.test.tsx` is the component-level template:
renders against a mocked `api/organizations` module (not real HTTP) inside
`renderWithProviders` (Mantine/react-query/router/RoleProvider wired up),
and covers the same shape worth testing in every future module's page —
data rendering, empty state, RBAC-gated buttons, a mutation's happy path,
and client-side validation. `src/test/setup.ts` also carries two jsdom
workarounds every new test file gets for free: a `matchMedia` stub Mantine
needs, and a `localStorage` polyfill (Node 22+'s experimental native
`localStorage` global can shadow jsdom's own working one and make every
call throw — see the comment there for why this isn't just a CLI flag).

## Testing

Two complementary suites — run both; they catch different classes of bugs.

### Unit tests (`npm test`)

Colocated next to each service and controller in `src/modules/` as
`<name>.service.spec.ts` / `<name>.controller.spec.ts`, plus the
infrastructure classes in `src/auth/`, `src/health/`, and `src/storage/` —
291 tests, no database, no MinIO, no Nest bootstrap, running in seconds.
Run `npm run test:cov` for a full coverage report — currently **100%**
statements/branches/functions/lines across every file; see
`backend/coverage/lcov-report/index.html` after running it.

- **Services** cover the business-rule branches in isolation:
  status-transition guard matrices, the "children drive the parent's state"
  computations (Document Control's approval-count flip, Maintenance's
  asset-status sync, Inventory's signed-quantity/insufficient-stock math,
  Accounting's Decimal total and payment logic, HSE's corrective-action
  close gate, HR's 360 average and the userId-vs-employeeNumber conflict
  disambiguation), and the P2002 → 409 translation every module uses for
  its unique constraint. `PrismaService` is mocked with `jest-mock-extended`
  (`test/utils/mock-prisma.ts`).
- **Controllers** are instantiated directly with hand-mocked services (no
  DI container) and checked for correct delegation: the right service
  method called with the right arguments, `req.user.id` (via
  `test/utils/mock-request.ts`) extracted into the right parameter, and
  query-string coercions like Inventory's `belowReorderPoint === 'true'`
  string-to-boolean mapping. Most controllers are thin passthroughs — the
  ones worth real scrutiny are `EmployeesController` and
  `AppraisalsController`, which each resolve the caller's own `Employee`
  record before calling into another service; their spec files assert that
  composition explicitly (e.g. `AppraisalsController.submitReview` submits
  under the resolved `employee.id`, not `req.user.id`, and never reaches
  `AppraisalsService` at all if that resolution fails).
- **Auth guards** (`CognitoAuthGuard`, `LocalDevAuthGuard`, `RolesGuard`)
  and the `@Public()`/`@Roles(...)` decorators are unit-tested against
  hand-built fake `ExecutionContext`/`Reflector` objects — no real HTTP
  request, no real JWT. `CognitoJwtVerifier` from `aws-jwt-verify` is
  mocked with `jest.mock(...)` so the token-verification branches (missing
  header, wrong scheme, rejected token, lazy user creation, deactivated
  user) are all reachable without a real Cognito user pool.
- **`StorageService`** is unit-tested by mocking `@aws-sdk/client-s3` and
  `@aws-sdk/s3-request-presigner` entirely (`jest.mock(...)`, each mocked
  Command class just echoes its constructor input back) — this checks the
  MinIO-vs-real-AWS client config branching and that the right command is
  sent with the right bucket/key, without needing MinIO or AWS reachable.

```bash
cd backend
npm test          # run once
npm run test:watch  # re-run on file change
npm run test:cov    # with a coverage report
```

The Prisma mock's `$transaction` just invokes the callback it's given with
the same mock as `tx` — every service in this codebase uses the
interactive-callback form of `$transaction`, never the array form, so this
covers all of them. When adding a service method wrapped in `$transaction`,
mock the individual `tx.model.method(...)` calls the same way you would on
`prisma` directly.

### e2e tests (`npm run test:e2e`)

One spec file per module in `backend/test/`, covering the same business
logic end-to-end through real HTTP requests, a real Postgres, and real
MinIO — role restrictions, the cross-module document links
(`?projectId=`/`?workOrderId=`/etc.), and the full multi-step workflows unit
tests can't see (e.g. HR's complete 360 cycle across four separate
reviewers, or Maintenance's asset staying down while a second concurrent
work order is still open). Each spec file boots the real `AppModule`
in-process (`Test.createTestingModule` + supertest against
`app.getHttpServer()`, no separate server or port needed) and drives it
through `x-local-role` headers exactly like `AUTH_MODE=local` does normally.

```bash
# Postgres + MinIO must be running (see Local development above)
docker compose up -d

cd backend
npm run test:e2e
```

**This truncates every table in whatever database `DATABASE_URL` points
at** (`backend/test/global-setup.js`, run once before the suite) — that's
what makes each run deterministic, but it means **never point `.env` at a
real/shared database when running this.** It's safe against the
`erp-local-postgres` container from `docker-compose.yml`, which is the
default and the only thing this should ever be pointed at.

Each spec file creates its own `Organization` and provisions whichever
`x-local-role` users it needs (via `test/utils/auth.ts`'s `provisionUser`,
which triggers `LocalDevAuthGuard`'s lazy user/role upsert), so files don't
depend on each other's data. Test files run serially (`maxWorkers: 1` in
`test/jest-e2e.json`) since they share one real database and MinIO bucket —
switching that to run in parallel would need each file scoped to
guaranteed-unique data to avoid races.

### Why both

The unit suite is fast feedback for logic changes and pins down exact
branch behavior (e.g. "a partial payment must NOT call `invoice.update`");
the e2e suite is the only one that proves the wiring — DI, Prisma's real
query behavior, guards actually applied to routes, multipart upload,
MinIO round-trips — actually works. A bug that only unit tests catch is
usually a business-rule mistake; a bug that only e2e tests catch is usually
a wiring mistake. Add a case to both when a module's behavior changes.

## Local development against the real AWS infra

```bash
cd backend
cp .env.example .env   # fill in real values after `terraform apply`
npm install
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

## Deploying infrastructure

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Before running in a real environment:
- Configure the commented-out S3 remote backend in `infra/main.tf`.
- Add an ACM certificate and an HTTPS listener to `infra/ecs.tf` (currently
  HTTP-only on port 80 for simplicity).
- Build and push the backend image to the ECR repo output as
  `ecr_repository_url`, then run `terraform apply` again (or update the ECS
  service) to roll it out.

## Notes on scope

Every module on the original roadmap is now built: Document Control,
Project Control, Assets, Maintenance, Inventory, Accounting, HSE, and HR
(Document Control → Project Control → Maintenance → Inventory → Accounting
→ HSE → HR was the build order, chosen so each later module could anchor
on models the earlier ones already established — Project, Asset, Document,
Employee).

`Department` was part of the core schema from the start (see `## Data
model`) but, until now, had no API of its own — it was only ever readable
as a nested `include` on `GET /organizations`. `src/modules/departments`
closes that gap with the standard CRUD shape used elsewhere: `GET
/departments` (optionally `?organizationId=`), `GET /departments/:id`,
`POST /departments` (admin-only, `P2002` on `(organizationId, code)` →
409), and `PATCH /departments/:id` (admin-only, `P2002` → 409, `P2025` →
404) for renaming.
