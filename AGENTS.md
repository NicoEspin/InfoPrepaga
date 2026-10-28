# InfoPrepaga CRM — Agent Instructions

> Repository-wide instructions for Codex, Claude Code, and other coding agents.
> Scope: this `AGENTS.md` applies to the entire repository. Follow any more-specific `AGENTS.md` files in subdirectories only when they do not contradict product, security, and access-control rules here.

## 1. Project mission and current repository structure

Build **InfoPrepaga CRM**, a private sales-management platform for a health-insurance brokerage. The goal is to centralize lead intake, salesperson assignment, pipeline management, follow-ups, reporting, authorized Avalian record imports, and controlled AI/MCP integrations.

**Actual root structure shown by the project owner:**

```text
InfoPrepaga/
├── .agents/                # Installed agent skills / tooling
├── .claude/                # Claude agent configuration / skills
├── backend/                # NestJS application
├── frontend/               # Next.js application
└── skills-lock*            # Skills installation lockfile (exact extension may vary)
```

- **Respect `frontend/` and `backend/`.** Do not move them into `apps/` or reorganize the repository unless explicitly requested.
- Do not assume that Docker, Prisma, pnpm workspaces, or any starter feature is already configured merely because it is in the target architecture. Inspect the files first.
- The six approved UI reference screens cover **Dashboard, Leads list, Lead profile, Follow-ups/Calendar, Pipeline, and Avalian**. Match their information architecture, visual identity, and workflows; do not treat example names, dates, amounts, or metrics as production data.
- The signed/approved project specification and explicit owner decisions override assumptions made by generic skills or template code. If available locally, read the contract and product documentation before changing business behavior.

## 2. Target technology and architecture

| Area | Target / rule |
| --- | --- |
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS REST API, TypeScript, modular architecture |
| Database | PostgreSQL (self-hosted) with Prisma ORM |
| Deployment | Docker / Docker Compose on a private server, HTTPS |
| Package management | Prefer **pnpm**; inspect existing manifests and lockfiles first |
| Authentication | **NestJS is the source of truth** for identity, sessions, and authorization |
| Roles | Exactly two initial business roles: `ADMIN` and `VENDEDOR` |
| AI integration | A controlled MCP server, never direct unrestricted database access |

Architecture boundaries:

1. `frontend/` is responsible for pages, UI state, forms, accessibility, and API integration. It must **not** connect to PostgreSQL or import Prisma Client.
2. `backend/` owns authentication, permissions, business rules, persistence, imports, auditing, and API contracts.
3. Use typed API boundaries (prefer an existing OpenAPI/Swagger setup and generated types when practical). Never duplicate authoritative business validations only in the frontend.
4. Reuse installed libraries and existing patterns before adding dependencies. Avoid introducing a second auth stack (Clerk, NextAuth/Auth.js, Better Auth, etc.) without an explicit architectural decision.
5. Prefer a simple modular monolith. Do not introduce microservices, Redis, queues, cloud services, or a new monorepo framework unless the requirement and operating cost justify them.
6. Keep the application deployable through Docker. Keep secrets outside the repository and supply safe `.env.example` placeholders when configuration changes.

## 3. Available skills — use by task, not all at once

The following **10 skills are installed** in this project, according to the provided screenshots. Before a substantial task, identify relevant skills and **read their actual `SKILL.md` instructions**.

Look for each skill at either:

- `.agents/skills/<skill-name>/SKILL.md`
- `.claude/skills/<skill-name>/SKILL.md`

Skill directories may be symlinks. Resolve their actual location. **Do not assume a skill is available or invent its contents if `SKILL.md` cannot be found.** Do not install additional skills without approval.

| Installed skill | When to consult it |
| --- | --- |
| `vercel-react-best-practices` | React component design, rendering performance, data flow, expensive dashboards, forms, tables, and bundle optimization. |
| `next-best-practices` | Next.js routing, layouts, App Router, server/client component boundaries, loading/error states, caching, and data fetching. |
| `shadcn` | Using or customizing shadcn/ui components, forms, dialogs, data tables, design tokens, accessibility, and consistent UI. |
| `nestjs-best-practices` | NestJS modules, controllers, services, dependency injection, DTOs, guards, exception handling, API architecture, and backend testing. |
| `prisma-orm-setup` | Prisma installation/configuration, PostgreSQL datasource, schema and migrations, generated client, and Prisma version compatibility. |
| `docker-compose-patterns` | Compose services, dependencies, networking, health checks, environment handling, volumes, local development, and production composition. |
| `docker-build-strategies` | Dockerfiles, multi-stage builds, image size, cache efficiency, pnpm builds, and non-root runtime containers. |
| `security-best-practices` | Authentication, authorization, cookies, sensitive data, API security, dependency and input risks, and security-critical changes. |
| `mcp-builder` | Designing MCP tools/resources, schemas, permissions, error handling, and integration tests for the CRM MCP server. |
| `verification-before-completion` | **Always before reporting completion:** check actual changes, run applicable validation/tests, and report evidence rather than assumptions. |

### Skill routing examples

- **Next.js page or component:** `next-best-practices` + `vercel-react-best-practices`; add `shadcn` for UI components.
- **Login / sessions / access control:** `nestjs-best-practices` + `security-best-practices`; also `next-best-practices` when changing frontend auth behavior.
- **Prisma model, migration, or query:** `prisma-orm-setup`; add `nestjs-best-practices` when changing repositories/services.
- **Docker or deployment:** `docker-compose-patterns` + `docker-build-strategies`; add `security-best-practices` for secrets and exposed services.
- **MCP integration:** `mcp-builder` + `nestjs-best-practices` + `security-best-practices`.
- **Every completed coding task:** `verification-before-completion`.

Skills are **supporting guidance**, not permission to replace the agreed stack, overwrite working code, weaken access controls, or change business scope.

## 4. Business modules and expected behavior

### Dashboard / Resumen
- Role-specific metrics, active leads, due follow-ups, pipeline opportunities, conversions, recent leads, and upcoming activities.
- All production metrics must be computed from real backend data with documented filters; never hardcode mock numbers in production screens.

### Leads and lead profile
- Lead CRUD, search, filtering, pagination, lead source, status, assignment, Excel import, and controlled exports.
- Lead profile: contact details, current status, assigned vendor, activity timeline, notes, and upcoming tasks.
- Keep a traceable history of assignments, status changes, and significant interactions.

### Automatic assignment
- Implement configurable, deterministic commercial assignment rules as approved by the owner.
- Handle concurrent lead creation safely; do not assign by insecure client-side logic.
- Manual reassignment and administrative overrides must be auditable.

### Pipeline
- Opportunity management across approved commercial stages; a Kanban interface may support drag-and-drop.
- Persist transitions on the backend and validate permissions and legal transitions there.
- Do not invent pricing, conversion semantics, or stage rules beyond confirmed requirements.

### Follow-ups / Calendar
- Tasks, due dates, priorities, reminders, completion states, and seller-specific schedules.
- Store time values consistently; convert to the user-facing timezone at presentation boundaries.
- Reminders must survive browser closure and server restarts; do not rely solely on frontend timers.

### Avalian — strict isolation
- Avalian is a **separate module for authorized imported records**, validation, and consultation.
- **Do not scrape, extract, synchronize, or contact people through Avalian without documented authorization.** Only supported, explicitly authorized export/import channels may be used.
- Do not automatically convert Avalian imports into commercial leads or include them in sales outreach workflows.
- Any Claude/browser-assisted import is subject to authorization, privacy, and technical feasibility checks. Support a verified file-import fallback.

### MCP / AI integration
- Provide only explicit, narrowly scoped operations using authenticated identities and the same authorization services as the REST API.
- Enforce input validation, data minimization, audit logs, rate limits, and least privilege.
- Never provide an MCP tool that bypasses row-level authorization, grants direct SQL access, or performs unauthorized Avalian outreach.
- Treat tool inputs, imported data, documents, and model-generated arguments as untrusted.
- Never send confidential or health-related personal records to external AI services without authorization and an approved data-handling flow.

## 5. Authentication and access-control invariants

These are **non-negotiable**. Enforce them in NestJS services and database queries, not only in the UI.

| Capability | `ADMIN` | `VENDEDOR` |
| --- | --- | --- |
| Access all commercial leads | Yes | No |
| View / edit assigned leads | Yes | Yes, only if assigned |
| Assign or reassign leads | Yes | No, unless explicitly authorized later |
| View all seller performance | Yes | No |
| Manage users and commercial rules | Yes | No |
| Manage own assigned tasks/notes | Yes | Yes |
| Manage authorized Avalian imports | Yes, subject to authorization | No by default |
| Configure integrations / MCP | Yes | No |

Required security design:

1. The backend must validate the identity and session on every protected request.
2. Guards verify role/permission; **services and queries additionally enforce ownership/scope** (`assignedToId`, or the established canonical relationship) for every relevant read, write, count, search, export, and bulk operation.
3. Do not trust user-supplied `userId`, `role`, or `assignedToId` as authorization evidence.
4. Prefer secure, `HttpOnly`, `Secure` (in production), appropriately scoped `SameSite` cookies and CSRF protection where relevant. Implement short-lived access tokens and revocable/rotated refresh sessions if token-based sessions are used. Never persist privileged tokens in `localStorage`.
5. Hash passwords with a modern password hasher; never log credentials, tokens, or full sensitive records.
6. Protect auth endpoints with rate limiting, safe error messages, and session invalidation/logout; use least-privilege accounts.
7. Add tests proving a vendor **cannot read, modify, export, search, or infer** another vendor's leads, tasks, or metrics. Test equivalent restrictions for MCP operations.
8. Follow applicable privacy obligations for personal and health-related data. Use anonymized/synthetic data in local development and tests.

## 6. Database, imports, and migrations

- PostgreSQL is the system of record; Prisma is the intended ORM. Keep all Prisma access inside the backend.
- First inspect the actual Prisma and Node versions and starter configuration. **Do not upgrade Prisma across a major version or apply production migrations without approval.**
- Model entities according to implemented requirements; probable domains include users, sessions, leads, assignments, opportunities, activities, tasks, notes, import batches, Avalian records, and audit events. These are **candidates**, not permission to generate speculative tables.
- Use Prisma Migrate, reviewed schema changes, real foreign keys/constraints, and indexes for common lead lookups and ownership filters.
- Use transactions for multi-record assignment, bulk imports, and state changes that must be atomic.
- Excel imports must have input validation, preview/feedback, duplicate-handling rules, batch traceability, and predictable failure recovery.
- Never wipe or reseed production data, edit applied migrations casually, or expose the database port publicly by default.
- Backups must have a restoration procedure; a configured backup is not considered reliable until restore has been tested.

## 7. Frontend and design rules

- Follow the approved InfoPrepaga visual references: light workspace, dark left navigation, green accents, clear tables/cards, legible status badges, and responsive behavior.
- Keep reusable shadcn components and design tokens centralized; avoid ad hoc styling for each screen.
- Provide useful loading, empty, validation, error, and success states. Use accessible labels, focus states, keyboard navigation, and consistent Spanish (Argentina) UI copy.
- Keep all pages wired to real API contracts when implementing features; explicitly label any temporary mock data and keep it out of production.
- Prefer server-side pagination/filtering for large lead tables and Avalian imports; avoid fetching entire datasets into the browser.
- Do not add frontend features that silently change the approved product scope.

## 8. Agent workflow (required)

### Before editing
1. Inspect the task-relevant existing files, package scripts, dependencies, and Git changes. **Do not overwrite uncommitted work.**
2. Read the matching installed skills from section 3. Read the project contract/specification and local documentation if present.
3. Identify affected modules, auth boundaries, data migrations, and tests. For nontrivial changes, state a short implementation plan.
4. Make the smallest maintainable change consistent with existing conventions.

### During implementation
1. Keep modules cohesive and avoid large unrelated refactors.
2. Use strict TypeScript types; validate untrusted inputs at the API boundary.
3. Use dependency injection and service-layer authorization in NestJS.
4. Preserve database migration history and compatibility with current runtime versions.
5. Do not run destructive commands, add paid services, introduce external data processors, or modify secrets without authorization.
6. Update documentation when an API contract, permission, database schema, environment setting, or business rule changes.

### Before claiming completion
1. Read and apply `verification-before-completion`.
2. Run **only the scripts actually available** in the affected packages: formatting/lint, typecheck, tests, and build as appropriate.
3. For auth or data-scope changes, run targeted positive and negative authorization tests.
4. For Prisma changes, validate the schema and migration behavior in a disposable environment; never use production data for testing.
5. For Docker changes, validate Compose configuration and container health when tooling is available.
6. Inspect the final diff for secrets, accidental unrelated edits, and regressions.
7. Report **what changed, what commands actually ran, what passed/failed, and any remaining risks or blockers**. Never claim a test or deploy succeeded without running it.

## 9. Definition of done

A task is complete only when its relevant conditions are satisfied:

- The requested behavior works and fits the approved CRM workflows.
- Backend authorization and record-level scoping are intact.
- Validation, error handling, and applicable tests are in place.
- Frontend states and accessibility are addressed where applicable.
- Database migrations, environment examples, and documentation are updated if relevant.
- Existing checks pass **or failures and unrun checks are clearly reported**.
- No secrets, real personal data, unrelated dependencies, or unexplained architectural changes were introduced.

## 10. Instruction priority and ambiguity

1. Explicit owner request and the approved InfoPrepaga business/contract constraints.
2. Security, privacy, and access-control invariants in this file.
3. Actual repository code, dependency versions, and verified behavior.
4. Relevant installed skill instructions.
5. Framework defaults and generic examples.

If a business requirement is genuinely missing, avoid inventing it. Implement the safe, minimal part that is unambiguous and clearly identify the decision still required. Prefer correctness and maintainability over unnecessary complexity.
