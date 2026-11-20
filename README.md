# ABRACODEBRA CREW OS

A JavaScript application for crew accounts, event recruitment, assignments, anonymous performance feedback, and reporting. The client uses SolidJS, Vite, Tailwind CSS, SweetAlert2, Lucide, and ECharts. The API uses Express, Knex, MySQL 8+, bcrypt, Zod, and persistent MySQL sessions.

## Requirements

- Node.js 22.12+ (Node.js 24 LTS recommended) and npm 10+.
- MySQL 8.0.16+; MySQL 8.4 is used by Compose.
- Docker with Compose v2 for the containerized setup.
- HTTPS and a reverse proxy for production.

## Quick start with Docker

From the repository root:

```sh
cp .env.example .env
```

Edit `.env`. Use different random values for `MYSQL_ROOT_PASSWORD`, `DB_PASSWORD`, and `SESSION_SECRET`; the session secret must contain at least 32 characters. Generate secrets with `openssl rand -hex 32`. Keep `NODE_ENV=development` and `APP_ORIGIN=http://localhost:3001` for local HTTP development.

```sh
docker compose up --build -d
docker compose exec app npm run db:seed
```

The app waits for MySQL and runs migrations before starting. Seed data contains reusable skill tags only. Default evaluation criteria are installed by the migration. No accounts, credentials, evaluations, or performance scores are fabricated.

Create the initial administrator without putting its password into command history:

```sh
read -r -p 'Admin username: ' ADMIN_USERNAME
read -r -p 'Admin full name: ' ADMIN_NAME
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
export ADMIN_USERNAME ADMIN_NAME ADMIN_PASSWORD
docker compose exec -e ADMIN_USERNAME -e ADMIN_NAME -e ADMIN_PASSWORD app npm run admin:create
unset ADMIN_USERNAME ADMIN_NAME ADMIN_PASSWORD
```

The `read -p` examples above use Bash; run `bash` first if your interactive shell is Zsh. Passwords must have 8–72 characters and no more than 72 UTF-8 bytes. Uppercase letters, lowercase letters, numbers, and symbols are optional. Bootstrap refuses to create another admin when one already exists.

Open **http://localhost:3001** and sign in. Only `ADMIN` and `CREW` account roles exist. External evaluators never create accounts.

## Local development

```sh
npm ci
cp server/.env.example server/.env
```

Set the database credentials, `SESSION_SECRET`, and `APP_ORIGIN=http://localhost:5173` in `server/.env`. Create the database and its account in MySQL (replace the password):

```sql
CREATE DATABASE crew_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'crew_os'@'%' IDENTIFIED BY 'your-long-random-password';
GRANT ALL PRIVILEGES ON crew_os.* TO 'crew_os'@'%';
```

Alternatively, configure the root `.env` and run only the database container:

```sh
docker compose up -d db
```

Use the same `DB_PASSWORD` in `server/.env` as the root `.env` when connecting to that database.

```sh
npm run db:migrate
npm run db:seed
```

Set `ADMIN_USERNAME`, `ADMIN_NAME`, and `ADMIN_PASSWORD` in the current shell using the secure prompts above, then:

```sh
npm run admin:create
unset ADMIN_USERNAME ADMIN_NAME ADMIN_PASSWORD
npm run dev
```

Frontend: **http://localhost:5173**. API: **http://localhost:3001/api**. Vite proxies `/api` to Express so browser authentication remains same-origin.

To build and serve through Express:

```sh
npm run build
```

Change `APP_ORIGIN` to `http://localhost:3001` in `server/.env`, then:

```sh
npm start
```

VS Code build, development, and test tasks are included in [.vscode/tasks.json](.vscode/tasks.json).

## Configuration

| Variable                                         | Purpose                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                       | Set `production` behind HTTPS; enables Secure cookies and HSTS.                            |
| `APP_ORIGIN`                                     | Exact browser origin, without a trailing slash; used for CORS and mutation origin checks.  |
| `PORT`                                           | Express port; defaults to 3001.                                                            |
| `DB_HOST`, `DB_PORT`                             | MySQL host and port.                                                                       |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`              | Database and application credentials.                                                      |
| `SESSION_SECRET`                                 | Strong random signing secret, at least 32 characters. Changing it invalidates cookies.     |
| `TRUST_PROXY`                                    | Exact trusted reverse-proxy hop count; defaults to 0. Use 1 only behind one trusted proxy. |
| `MYSQL_ROOT_PASSWORD`                            | Compose database initialization only.                                                      |
| `ADMIN_USERNAME`, `ADMIN_NAME`, `ADMIN_PASSWORD` | Initial administrator bootstrap only; remove after use.                                    |

Server commands load `server/.env`. Compose loads the root `.env` and injects environment variables. Committed examples contain no working credentials.

## Working flows

1. **Crew accounts:** users register with a pending account. Admins review approvals. Admin-created crew are immediately approved. Crew can edit their name, email, phone, and photo, and change their password. Admins manage skill tags, reset passwords, and archive accounts.
2. **Events:** admins create events, edit lifecycle status, and assign approved crew. Crew see only their assigned event details. Event details have one continuous page for information, assigned crew, registration, and evaluation.
3. **Open registration:** save registration settings, enable registration, and generate a link. Approved crew apply. New crew can register from that link; the intended event application is stored transactionally while their account is pending. Account approval never creates an assignment. An admin reviews the event application separately.
4. **Capacity:** quota counts all assignments, including manual assignments. Pending applications do not occupy slots. Event-row locks and current locking reads serialize capacity checks and insertion. There is no quota override. Existing applications can be reviewed after registration closes, but approval still requires an approved account and free capacity.
5. **External evaluation:** generate one shared event link and send it to evaluators. Each evaluator enters a name and description and gets a private browser session. They can save drafts for multiple crew and submit them independently. Submitted evaluations are locked. Admins can unpublish and return a submission for correction.
6. **Internal evaluation:** admins use the same criteria and scoring controls from event details. Each admin has one evaluation per event/crew pair.
7. **Publication:** review the original feedback and edit the public version to remove identifying details, then publish. Empty public feedback hides the written text. Crew APIs return only allowlisted anonymous results.
8. **Performance:** each evaluation averages raw criterion scores. Each event averages its published evaluations. Overall scores average completed-event scores equally. Categories also average within an event before averaging across events. Missing results are `null`, displayed as “Not Evaluated.” Values are calculated on read, so publishing, unpublishing, corrections, and status changes take effect immediately.
9. **Reports:** filter by event/end-date range and download CSV or XLSX for crew, participation/assignments, registrations, performance rankings, and evaluation summaries. Formula-like text is escaped. Exports exclude credentials and tokens.

## Secure defaults and design decisions

- Server-side role and ownership checks apply independently of frontend route guards.
- Authentication regenerates the session ID. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Sessions are persisted in MySQL and expire after eight hours of inactivity. Password changes, resets, and account archival invalidate existing authenticated sessions using an account session version.
- Cookie-authenticated mutations, including login and public evaluator submissions, require a synchronizer CSRF token from `GET /api/auth/me` in `X-CSRF-Token`. Browser origins are checked against the configured origin.
- External authorization is separate from account authorization. An external session never sets an authenticated user. High-entropy evaluator secrets are kept only in the server-side session and hashed in evaluator records.
- Shared links use 256-bit random tokens. Only hashes are stored in link tables. Raw links are shown once when generated; save the link or generate a replacement. Tokens are never written to audit logs. Regeneration revokes previous evaluator sessions.
- A shared public link cannot verify a real person's identity or prevent one person from starting several sessions. Rate limits and optional session revocation reduce abuse; they do not provide identity verification.
- The session store is a small `express-session` Store implementation using the application's Knex/MySQL connection. No in-memory fallback is used in the running application. MemoryStore appears only in isolated HTTP unit tests.
- Global criteria are snapshotted when the event's evaluation controls are first opened or an evaluation link is created. Admins can configure the snapshot before evaluations exist. Once any evaluation exists, the event's criterion set is locked. Global criteria can be disabled but are never deleted.
- Event registration is unavailable for draft, completed, cancelled, or archived events. Deadline input uses the browser's local timezone and is stored as UTC. Quotas cannot be reduced below current assignments.
- One registration record is retained per crew/event. Pending applications can be withdrawn and resubmitted. Rejected applications cannot be resubmitted through the same record. Admins can assign rejected applicants manually if appropriate.
- Important records are archived rather than hard-deleted. Archiving an event disables its links but preserves historical scores; event lifecycle status still determines scoring eligibility. Assignments with evaluation history cannot be removed.
- Uploads are restricted to 5 MB, decoded with a pixel limit, resized to 400×400, stripped of metadata, and re-encoded as WebP. Access is authenticated and restricted to the profile owner or an admin. Original uploads are not saved. Old normalized photos are retained; schedule orphan-file cleanup if needed.
- API responses use `Cache-Control: no-store`; all responses use `Referrer-Policy: no-referrer`. Error responses do not expose SQL or stack traces. Audit metadata excludes passwords, token values, and feedback content.
- The single-process rate limiter is appropriate for this deployment. For multiple instances, enforce shared limits at a trusted gateway and keep the MySQL session store shared.
- Pagination/filtering for crew and event directories happens on the server. Analytics currently compute per crew on demand; for very large organizations, optimize with batched queries or materialized summaries while retaining the same scoring rules.

## Project map

- [client/src](client/src): SolidJS routes, role guards, responsive layouts, data fetching, forms, reusable UI, and charts.
- [server/src/routes/api.js](server/src/routes/api.js): API routing, permissions, and validation boundaries.
- [server/src/services](server/src/services): account, crew, event, registration, evaluation, scoring, and report business logic.
- [server/src/config/session.js](server/src/config/session.js): persistent MySQL session storage.
- [server/src/serializers](server/src/serializers): explicit crew performance serialization.
- [server/database/migrations](server/database/migrations): normalized MySQL schema, constraints, indexes, and rollback.
- [server/database/seeds](server/database/seeds): idempotent development skill seed.
- [server/tests](server/tests): unit/security tests and real-MySQL workflow integration suite.
- [compose.yaml](compose.yaml), [Dockerfile](Dockerfile): application and MySQL deployment.
- [compose.test.yaml](compose.test.yaml): disposable MySQL test environment.

All API success responses use `{ "data": ... }`; failures use `{ "error": "...", "details": [...] }` where validation details are applicable. Reports return downloadable file bodies. The API follows the requested `/api` endpoints, with additional criteria, photo, withdrawal, session revocation, and evaluation reopening endpoints.

## Tests

```sh
npm run check
npm test
npm run build
npm audit
```

Unit tests cover scoring, equal event/category weighting, missing data, recalculation, identity serialization, password/scoring validation, token integrity, formula escaping, real XLSX read/write, unauthenticated authorization, logout, and CSRF.

Run the integration suite against a disposable MySQL database:

```sh
docker compose -f compose.test.yaml up --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down -v
```

The test database uses tmpfs. Shut down the test stack between runs. Its credentials are deliberately test-only and are not used by the application deployment.

Or create an empty database whose name ends in `_test`, grant a test account access, and run:

```sh
DB_NAME=crew_os_test DB_USER=crew_os_test DB_PASSWORD=your-test-password npm run test:integration
```

The suite refuses non-test database names and databases with an existing users table. It runs migrations and leaves the test database populated for inspection. Recreate only that disposable database before rerunning. Integration tests cover account approval, IDOR prevention, quota races, duplicate assignments/applications, pending-account event intent, evaluator isolation, drafts, corrections, publication, anonymity, reports, token expiration/revocation, session invalidation, audit logs, and historical retention.

`npm run db:rollback` rolls back the latest migration batch and removes its tables. Use only on disposable development databases or as part of a planned recovery with backups.

## Production deployment

1. Set unique secrets, `NODE_ENV=production`, `APP_ORIGIN=https://your-host`, and the correct `TRUST_PROXY` value. Terminate HTTPS at a trusted reverse proxy. The application rejects a production HTTP origin.
2. Keep MySQL private. The sample binds MySQL and Express ports to loopback; route external traffic through the proxy.
3. Build, migrate, bootstrap the first administrator, and seed skills if desired. For multiple app replicas, run migrations as a separate deployment step instead of concurrently on startup.
4. Persist and back up both MySQL and the uploads volume. Test restores. Keep `.env` and backups out of source control.
5. Monitor process health via `/health` and database connectivity separately. `/health` is a process liveness check, not a database readiness check.
6. Rotate secrets when necessary and review audit logs. Apply dependency updates and run the integration suite before rollout.

PM2 is optional; Docker restart policies already supervise the process. If using PM2 outside Docker, run the built server with the same environment and one process, or configure gateway rate limits before scaling.

## Verification status

The implementation includes the full client and API workflows above, migrations, seeds, exports, and tests. The local environment used for development has Node.js but no MySQL server or Docker executable. Consequently, database migrations, transaction races, persistent sessions, and full browser-to-MySQL scenarios require running the integration suite in the provided MySQL environment before production use. Do not treat a passing frontend build or unit test suite as proof of those integrations.
