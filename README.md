# BAUST CSE Fest – Judge Invitation & Allocation Management System

A full-stack web application for managing fest judges, single-fest invitations with automatic deadline expiration, multi-slot competitions, primary and standby faculty backup allocations, overlap conflict detection, competition-day attendance, and replacement audit trails.

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (zero frontend frameworks) + Lucide Icons (`/vendor/lucide.min.js`)
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (hosted on Supabase) via `pg`
- **Authentication & Security**: `bcrypt` password hashing, PostgreSQL-backed HTTP-only session cookies (`HttpOnly; Secure; SameSite=None; Partitioned`), CSRF token + Origin verification, parameterized SQL queries, and strict `ADMIN` / `JUDGE` role isolation

---

## Project Structure

```text
├── db/
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Normalized PostgreSQL schema, constraints & triggers
│   ├── migrate.ts                   # Transactional SQL migration runner
│   └── seed.ts                      # Initial administrator account seed script
├── public/
│   ├── css/styles.css               # Responsive design system (#2563EB primary)
│   ├── js/
│   │   ├── api.js                   # Fetch client, CSRF header injection, HTML escaping, modals/toasts
│   │   ├── app.js                   # Hash SPA router & collapsible hamburger sidebar shell
│   │   ├── authViews.js             # First-run admin bootstrap & Admin/Judge login
│   │   ├── adminDashboardViews.js   # Dashboard, Reports (with CSV export), Settings
│   │   ├── adminJudgesViews.js      # Judges directory, Judge details, Invitations
│   │   ├── adminCompetitionsViews.js# Competitions, Competition slots, Judge allocation
│   │   ├── adminOperationsViews.js  # Backup management & Competition-day attendance
│   │   └── judgeViews.js            # Judge dashboard, invitations, assignments, schedule, profile
│   └── index.html                   # HTML5 entry shell
├── server/
│   ├── routes/                      # Express REST API routers
│   ├── app.ts                       # Express app factory, headers, static serving & error handler
│   ├── db.ts                        # pg Pool with SSL & transaction helper
│   └── security.ts                  # Sessions, CSRF, RBAC, activity logging, auto-expiration
├── tests/
│   └── verify_all_scenarios.ts      # Integration suite covering all 13 scenarios & security
├── schema.sql                       # Canonical PostgreSQL schema
├── server.ts                        # Server entrypoint
├── .env.example                     # Environment variable template (no credentials)
└── PROJECT_STATUS.md                # Phase tracking & schema log
```

---

## Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and populate your Supabase PostgreSQL credentials (never commit `.env` to Git):

```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

DB_HOST=your-supabase-pooler-host
DB_PORT=6543
DB_NAME=postgres
DB_USER=your-supabase-user
DB_PASSWORD=your-database-password
DB_SSL=true

ADMIN_EMAIL=admin@baust.edu.bd
ADMIN_PASSWORD=your-strong-admin-password
ADMIN_NAME=BAUST CSE Fest Admin
```

> **Note for passwords with special characters (`$`, `#`)**: Enclose values in single quotes inside `.env` (e.g., `DB_PASSWORD='...'`) so `dotenv` does not treat `#` as a comment or `$` as variable expansion.

### 3. Run Database Migrations
```bash
npm run db:migrate
```

### 4. Seed Initial Administrator (Optional CLI Bootstrap)
You can seed the initial admin from environment variables or CLI arguments:
```bash
npm run db:seed
# or:
npx tsx db/seed.ts --email admin@baust.edu.bd --password "YourStrongPassword123!" --name "Fest Admin"
```
Alternatively, if no `ADMIN` user exists yet, opening the web UI presents a one-time **Initialize Administrator Account** screen (which locks permanently once the first admin is created).

---

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
NODE_ENV=production npm start
```
The application listens on `PORT` (default `3000`).

### Typecheck & Integration Testing
```bash
npm run lint
npx tsx tests/verify_all_scenarios.ts
```

---

## Key Database & Workflow Guarantees

- **One Invitation Per Judge**: Enforced by `UNIQUE (judge_id)` on `judge_invitations`. Unanswered invitations past `expiration_date` automatically transition to `EXPIRED`.
- **Accepted-Invitation & Faculty-Backup Enforcement**: Enforced in API transactions and PostgreSQL trigger `fn_validate_judge_assignment`.
- **Overlap & Duplicate Prevention**: Partial unique index `uq_active_judge_slot_assignment` prevents duplicate active allocations while keeping historical rows (`DECLINED`, `WITHDRAWN`, `REPLACED`, `CANCELLED_SLOT`, `CANCELLED_DEACTIVATED`). Triggers block overlapping assignments for both `PRIMARY` and `BACKUP` judges and detect reschedule overlaps (`fn_validate_slot_reschedule`).
- **Replacement Traceability**: Activating a standby or dynamic faculty backup sets the original assignment to `REPLACED` (preserving attendance such as `ABSENT`) and links the replacement via `replaces_assignment_id`. Late arrivals after replacement are explicitly resolved via `KEEP_REPLACEMENT` or `RESTORE_ORIGINAL`.

---

## Deployment Checklist

1. Provision environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL=true`, `NODE_ENV=production`) in your hosting provider's Secrets/Env UI.
2. Run `npm run db:migrate` against the production Supabase database.
3. Run `npm run db:seed` or claim the initial admin via the first-run setup UI immediately after deploy.
4. Start the server with `npm start` behind HTTPS (`trust proxy` is enabled for reverse-proxy deployments).
