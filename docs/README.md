# Mentoraura — Backend API

> **NestJS Modular Monolith** · TypeScript · PostgreSQL · Redis · BullMQ

[![CI — Backend](https://github.com/YOUR_ORG/mentoraura-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/mentoraura-backend/actions/workflows/ci.yml)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Module Map](#module-map)
- [API Conventions](#api-conventions)
- [Authentication & Authorization](#authentication--authorization)
- [Payment Architecture](#payment-architecture)
- [Background Jobs](#background-jobs)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Contributing](#contributing)
- [Branch Strategy](#branch-strategy)

---

## Overview

Mentoraura Backend is the **single API service** for the Mentoraura platform — a mentorship marketplace connecting mentees with vetted mentors across Africa.

It is built as a **modular monolith**: all business domains live in one deployable unit with clearly enforced module boundaries. This lets us move fast now and extract hot modules into independent services later if scale demands it — without rewriting the frontend API.

**Key responsibilities:**
- Identity, authentication, and RBAC
- Mentor vetting, KYC, and profile management
- Marketplace discovery and search
- Mentorship lifecycle management
- Scheduling and bookings
- 1:1 messaging (restricted to active relationships)
- Payments (MTN MoMo, Orange Money, Card) with idempotent webhook handling
- Commission calculation and mentor payouts
- Transactional email and in-app notifications
- Admin tooling: applications, disputes, moderation, analytics

---

## Architecture

```
NestJS API (Modular Monolith)
│
├── src/modules/
│   ├── identity/         Auth, Users, Sessions, Authorization
│   ├── mentor/           Profiles, Applications, Vetting, KYC, Availability
│   ├── marketplace/      Plans, Sessions, Search, Categories, Discovery
│   ├── mentorship/       Applications, Lifecycle, Sessions, Reviews
│   ├── scheduling/       Availability, Time Slots, Bookings, Calendar
│   ├── messaging/        Conversations, Messages, Attachments, Moderation
│   ├── payments/         Checkout, Providers, Webhooks, Refunds
│   ├── commission/       Rules, Calculation, Records
│   ├── payouts/          Balance, Batches, Providers, Reconciliation
│   ├── notifications/    In-App, Email, SMS (Phase 2)
│   ├── reviews/          Ratings, Moderation
│   ├── administration/   Users, Configuration, Disputes, Moderation, Reporting
│   └── content/          Blog, Career Paths, Resources
│
├── src/common/           Guards, Decorators, Filters, Interceptors, Types
├── src/config/           Config factories
└── src/database/         Migrations, Seeds
```

**Data stores:**
| Store | Role |
|-------|------|
| PostgreSQL | Source of truth for all relational/financial data |
| Redis | Cache, rate limiting, BullMQ job queue |
| Object Storage (S3-compatible) | Profile images, KYC docs, message attachments |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 16+ |
| Redis | 7+ |

---

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_ORG/mentoraura-backend.git
cd mentoraura-backend

# 2. Install dependencies
npm install

# 3. Copy environment template and fill in values
cp .env.example .env

# 4. Start the development server (watch mode)
npm run start:dev
```

The API will be available at `http://localhost:4000/api/v1`.

### API Documentation (Swagger)

Interactive Swagger / OpenAPI 3.0 documentation is available when the dev server is running:

👉 **`http://localhost:4000/docs`**

- **Interactive UI**: Test endpoints directly in the browser with "Try it out".
- **Authentication**: Use the **"Authorize"** button (top-right) to test JWT Bearer protected routes.
- **OpenAPI JSON Spec**: Available at `http://localhost:4000/docs-json` for generating type-safe frontend API clients.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before running locally.

> ⚠️ **Never commit `.env` to version control.** Use `.env.example` to document required keys.

See [`.env.example`](./.env.example) for a full reference with descriptions.

---

## Project Structure

```
mentoraura-backend/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI pipeline
├── src/
│   ├── app.module.ts           # Root module — wires all domain modules
│   ├── main.ts                 # Bootstrap (global pipes, CORS, versioning)
│   ├── common/
│   │   ├── decorators/         # @Public(), @Roles(), @CurrentUser()
│   │   ├── filters/            # Global exception filters
│   │   ├── guards/             # JWT guard, Roles guard
│   │   ├── interceptors/       # Logging, response transformation
│   │   ├── pipes/              # Custom validation pipes
│   │   ├── middleware/         # HTTP middleware
│   │   ├── types/              # Shared interfaces and enums
│   │   ├── utils/              # Pure utility functions
│   │   ├── constants/          # App-wide constants
│   │   └── events/             # Internal domain event types
│   ├── config/                 # Config factories (db, redis, jwt, etc.)
│   ├── database/
│   │   ├── migrations/         # SQL migration files
│   │   └── seeds/              # Seed scripts for dev/test
│   └── modules/                # All domain modules (see Module Map below)
├── test/
│   └── app.e2e-spec.ts         # E2E tests (Supertest)
├── .env.example
├── .gitignore
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

### Internal Module Structure

Every module follows this standard layout:

```
payments/
├── payments.module.ts
├── payments.controller.ts
├── payments.service.ts
├── payments.repository.ts
├── dto/
│   ├── create-payment.dto.ts
│   └── verify-payment.dto.ts
├── entities/
│   └── payment.entity.ts
├── providers/
│   ├── payment-provider.interface.ts
│   ├── adapters/
│   │   ├── mtn-momo.adapter.ts
│   │   └── orange-money.adapter.ts
├── events/
│   └── payment-succeeded.event.ts
└── tests/
    ├── payments.service.spec.ts
    └── payments.controller.spec.ts
```

---

## Module Map

| Domain | Modules |
|--------|---------|
| **Identity** | `auth`, `users`, `sessions`, `authorization` |
| **Mentor** | `profiles`, `applications`, `vetting`, `kyc`, `availability` |
| **Marketplace** | `plans`, `sessions`, `search`, `categories`, `discovery` |
| **Mentorship** | `applications`, `lifecycle`, `sessions`, `reviews` |
| **Scheduling** | `availability`, `slots`, `bookings`, `calendar` |
| **Messaging** | `conversations`, `messages`, `attachments`, `moderation` |
| **Payments** | `checkout`, `providers`, `webhooks`, `refunds` |
| **Commission** | `rules`, `calculation`, `records` |
| **Payouts** | `balance`, `batches`, `providers`, `reconciliation` |
| **Notifications** | `in-app`, `email`, `sms` (Phase 2) |
| **Reviews** | `ratings`, `moderation` |
| **Administration** | `users`, `configuration`, `disputes`, `moderation`, `reporting` |
| **Content** | `blog`, `careers`, `resources` |

---

## API Conventions

- **Base URL**: `/api/v1/`
- **Auth header**: `Authorization: Bearer <access_token>`
- **Response envelope**: `{ data: T, message?: string }`
- **Error envelope**: `{ statusCode: number, message: string | string[], error: string }`
- All timestamps in **ISO 8601 UTC** (`2025-01-01T00:00:00.000Z`)
- All monetary amounts in **minor units** (e.g., `500000` = 5,000 XAF)

---

## Authentication & Authorization

Every protected route passes through this chain:

```
Request → JwtAuthGuard → RolesGuard → ResourceOwnershipCheck → Handler
```

- Use `@Public()` on routes that must be unauthenticated (e.g., `POST /auth/login`)
- Use `@Roles(Role.ADMIN)` to restrict to specific roles
- **Business logic is never delegated to the frontend** — all state changes happen server-side

---

## Payment Architecture

Payments use the **adapter pattern** — adding a new payment provider means implementing `IPaymentProvider` only:

```
PaymentService
  └── PaymentProviderRegistry
        ├── MtnMomoAdapter      (implements IPaymentProvider)
        ├── OrangeMoneyAdapter  (implements IPaymentProvider)
        └── CardAdapter         (implements IPaymentProvider)
```

All payment-critical operations must be **idempotent** — include an `idempotencyKey` on state-changing requests.

Financial model per payment:
```
grossAmount  =  mentorPayable + commissionAmount
```

---

## Background Jobs

Jobs are queued via **BullMQ → Redis**:

| Queue | Workers |
|-------|---------|
| `email` | Transactional emails |
| `notifications` | In-app notification fan-out |
| `payment-retry` | Safe retry for failed payment checks |
| `payout-processing` | Async payout batch dispatch |
| `fx-refresh` | Exchange rate updates |

Jobs must be **idempotent and retryable**.

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# Watch mode
npm run test:watch

# E2E tests (requires running PostgreSQL + Redis)
npm run test:e2e
```

Test files live alongside their source files in a `tests/` subfolder within each module.

---

## CI/CD

Every push and pull request to `main` or `develop` runs the CI pipeline:

| Job | What it checks |
|-----|----------------|
| `lint-and-typecheck` | ESLint + `tsc --noEmit` |
| `unit-tests` | Jest unit tests + coverage report |
| `build` | `npm run build` (TypeScript compile to `dist/`) |
| `e2e-tests` | Supertest E2E against live PostgreSQL + Redis services |
| `security-audit` | `npm audit --audit-level=high` |

See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Contributing

1. **Branch from `develop`** — never commit directly to `main`
2. **Branch naming**: `feat/`, `fix/`, `chore/`, `docs/` prefix  
   e.g. `feat/identity-auth-jwt`, `fix/payment-webhook-idempotency`
3. **Commits**: follow [Conventional Commits](https://www.conventionalcommits.org/)  
   e.g. `feat(payments): add MTN MoMo webhook handler`
4. **Pull Requests**: must pass all CI jobs before merge
5. **PR description**: include what, why, and how to test

---

## Branch Strategy

```
main        ← production deployments only (protected)
develop     ← integration branch; all feature PRs target here
feat/*      ← new features
fix/*       ← bug fixes
chore/*     ← tooling, dependencies, config
docs/*      ← documentation only
release/*   ← release preparation (bump version, changelog)
```
