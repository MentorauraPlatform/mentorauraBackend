# 🏗️ Mentoraura Backend — Architecture & Roadmap

> **Stack:** NestJS · TypeScript · PostgreSQL · Redis · BullMQ · Object Storage
> **Pattern:** Modular Monolith → extract only when metrics justify it
> **Timeline:** `Aug 19, 2026` → `Nov 19, 2026`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Map](#2-module-map)
3. [Internal Module Structure](#3-internal-module-structure)
4. [Data Architecture](#4-data-architecture)
5. [Payment Architecture](#5-payment-architecture)
6. [Background Jobs](#6-background-jobs)
7. [Security Layers](#7-security-layers)
8. [Scalability Path](#8-scalability-path)
9. [Project Milestones](#9-project-milestones)

---

## 1. System Overview

```
                           INTERNET
                               │
                    ┌──────────▼──────────┐
                    │    Cloudflare Edge  │
                    │   CDN · WAF · DNS   │
                    └──────────┬──────────┘
                               │ HTTPS / TLS
               ┌───────────────┴───────────────┐
               ▼                               ▼
      ┌─────────────────┐             ┌──────────────────┐
      │    Next.js      │             │  Static Assets   │
      │   (Frontend)    │             │     via CDN      │
      └────────┬────────┘             └──────────────────┘
               │  REST / JSON
               ▼
      ┌─────────────────────────────────────────────┐
      │              NestJS API                     │  ◄── YOU ARE HERE
      │           Modular Monolith                  │
      │                                             │
      │  identity · mentor · marketplace            │
      │  mentorship · scheduling · messaging        │
      │  payments · commission · payouts            │
      │  notifications · reviews · admin · content  │
      └──────────────────┬──────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐  ┌──────────┐  ┌────────────────┐
   │ PostgreSQL │  │  Redis   │  │ Object Storage │
   │  Source of │  │  Cache / │  │ KYC · Images · │
   │   Truth    │  │  Queue   │  │  Attachments   │
   └─────┬──────┘  └────┬─────┘  └────────────────┘
         │              │
         │         ┌────▼──────────┐
         │         │  BullMQ       │
         │         │  Workers      │
         │         └────┬──────────┘
         │              │
         │     ┌────────┼────────┐
         │     ▼        ▼        ▼
         │   Email  Payments  Payouts
         │
         ▼
   ┌────────────────────┐
   │   Search Layer     │
   │  PostgreSQL FTS +  │
   │  Trigram (MVP)     │
   │  → Meilisearch     │
   │    (Phase 2)       │
   └────────────────────┘

   ┌─────────────────────────────────────┐
   │          External Services          │
   │  MTN MoMo · Orange Money · Card     │
   │  KYC Provider · Google Meet / Zoom  │
   └─────────────────────────────────────┘
```

> **Core principle:** The frontend renders. The backend decides.
> Business logic lives exclusively in NestJS — never in Next.js.

---

## 2. Module Map

```
src/modules/
│
├── identity/
│   ├── auth              JWT issue · refresh · logout
│   ├── users             User CRUD · profile management
│   ├── sessions          Token lifecycle · revocation
│   └── authorization     RBAC guards · role resolution
│
├── mentor/
│   ├── profiles          Public profile management
│   ├── applications      Mentor application flow
│   ├── vetting           Admin review workflow
│   ├── kyc               Document upload · KYC provider adapter
│   └── availability      Weekly schedule · timezone config
│
├── marketplace/
│   ├── plans             Subscription plan CRUD
│   ├── sessions          One-off session listings
│   ├── search            PostgreSQL FTS + trigram
│   ├── categories        Skill taxonomy
│   └── discovery         Homepage recommendations
│
├── mentorship/
│   ├── applications      Mentee → Mentor application
│   ├── lifecycle         Activate · pause · complete · cancel
│   ├── sessions          Session records
│   └── reviews           Post-session review trigger
│
├── scheduling/
│   ├── availability      Slot generation from weekly schedule
│   ├── slots             Available time slot computation
│   ├── bookings          Book · confirm · cancel (with DB lock)
│   └── calendar          Meeting link creation (Meet / Zoom)
│
├── messaging/
│   ├── conversations     1:1 thread management
│   ├── messages          Send · read · paginate
│   ├── attachments       S3-backed file upload
│   └── moderation        Flag · report · admin review
│
├── payments/
│   ├── checkout          Payment intent creation
│   ├── providers         Adapter registry (MTN / Orange / Card)
│   ├── webhooks          Inbound webhook handler + verify
│   └── refunds           Refund initiation + tracking
│
├── commission/
│   ├── rules             Commission rate configuration
│   ├── calculation       gross = commission + mentor_payable
│   └── records           Immutable financial ledger
│
├── payouts/
│   ├── balance           Mentor available balance view
│   ├── batches           Payout batch assembly
│   ├── providers         Mobile Money / Bank adapter
│   └── reconciliation    Batch result matching
│
├── notifications/
│   ├── in-app            Real-time notification records
│   ├── email             Transactional email via SMTP
│   └── sms               Phase 2 (stubbed)
│
├── reviews/
│   ├── ratings           1–5 star records + mentor avg
│   └── moderation        Flag · hide · admin action
│
├── administration/
│   ├── users             Suspend · activate · delete users
│   ├── configuration     Feature flags · platform config
│   ├── disputes          Dispute creation + resolution
│   ├── moderation        Content moderation queue
│   └── reporting         Analytics queries + exports
│
└── content/
    ├── blog              Blog post CRUD + publish
    ├── careers           Career path content
    └── resources         Resource library
```

### Inter-module Communication

Modules **never** access another module's repository directly.

**Async (events/jobs):**
```
PaymentService
    │  emits PaymentSucceededEvent
    ▼
MentorshipService   → activates mentorship
    │  emits MentorshipActivatedEvent
    ▼
NotificationService → sends email + in-app
```

**Sync (service calls):**
```
BookingService → AvailabilityService → BookingRepository
```

---

## 3. Internal Module Structure

Every module follows this exact layout:

```
payments/
├── payments.module.ts          NestJS DI wiring
├── payments.controller.ts      HTTP layer only — no business logic
├── payments.service.ts         All business rules live here
├── payments.repository.ts      All DB queries live here
├── dto/
│   ├── create-payment.dto.ts
│   └── verify-payment.dto.ts
├── entities/
│   └── payment.entity.ts
├── providers/
│   ├── payment-provider.interface.ts   ← all adapters implement this
│   └── adapters/
│       ├── mtn-momo.adapter.ts
│       ├── orange-money.adapter.ts
│       └── card.adapter.ts
├── events/
│   └── payment-succeeded.event.ts
└── tests/
    ├── payments.service.spec.ts
    └── payments.controller.spec.ts
```

**Request chain:**
```
Controller → Service → Repository → PostgreSQL
                │
                └──► External Adapter (via IPaymentProvider interface)
```

---

## 4. Data Architecture

### Entity Relationships

```
User
 ├── MentorProfile
 │     ├── Plan[]
 │     ├── Availability
 │     └── MentorApplication
 │               └── MentorKyc
 └── (as Mentee)
       └── MentorshipApplication
                 └── Mentorship
                       ├── Booking[]
                       ├── Conversation
                       │     └── Message[]
                       │           └── Attachment[]
                       └── Review
                             └── Payment
                                   ├── CommissionRecord
                                   └── PayoutBatch
                                         └── PayoutTransaction
```

### Key Tables

| Domain | Tables |
|--------|--------|
| Identity | `users` · `roles` · `user_roles` · `refresh_tokens` |
| Mentor | `mentor_profiles` · `mentor_applications` · `mentor_kyc` |
| Taxonomy | `categories` · `skills` · `languages` |
| Marketplace | `plans` · `one_off_sessions` |
| Scheduling | `availability` · `blackout_dates` · `bookings` |
| Mentorship | `mentorship_applications` · `mentorships` · `sessions` |
| Messaging | `conversations` · `messages` · `message_attachments` |
| Payments | `payments` · `payment_events` · `refunds` |
| Financial | `commission_records` · `payout_batches` · `payout_transactions` |
| Trust | `reviews` · `disputes` · `reports` · `audit_logs` |
| Platform | `notifications` · `configurations` · `content_posts` |

**Financial amounts:** stored in **minor units** (e.g. `500000` = 5,000 XAF).
**Timestamps:** all UTC, ISO 8601.

---

## 5. Payment Architecture

```
Mentee
  │
  ▼
POST /payments/checkout  (idempotencyKey required)
  │
  ▼
Validate order
  │
  ▼
PaymentProviderRegistry
  ├── MtnMomoAdapter    (implements IPaymentProvider)
  ├── OrangeMoneyAdapter
  └── CardAdapter
  │
  ▼
External payment provider
  │
  ▼
Provider Webhook  ──►  POST /payments/webhook
                          │
                          ▼
                    Verify HMAC signature
                          │
                          ▼
                    Idempotency check
                    ├── Already processed → 200 OK, no-op
                    └── New event
                          │
                          ▼
                    Record Payment (DB transaction)
                          │
                          ▼
                    Calculate Commission
                    grossAmount = commissionAmount + mentorPayable
                          │
                          ▼
                    Activate Service (mentorship/session)
                          │
                          ▼
                    Write CommissionRecord (immutable)
                          │
                          ▼
                    Enqueue payout-queue job
```

> ⚠️ Every payment operation must be **idempotent and safely retryable**.
> Changing a payment provider = implement `IPaymentProvider` only. Zero changes elsewhere.

---

## 6. Background Jobs

| Queue | Triggered by | Worker action |
|-------|-------------|---------------|
| `email-queue` | Any domain event | Send transactional email |
| `notification-queue` | Any domain event | Write in-app notification |
| `payment-retry` | Failed payment check | Re-query provider status |
| `payout-queue` | Mentor payout request | Dispatch to payout provider |
| `fx-refresh` | Cron schedule | Update exchange rates |

All workers: **idempotent**, **retryable**, **logged**.

---

## 7. Security Layers

```
INTERNET
    │
    ▼  Cloudflare WAF · DDoS protection · edge cache
    │
    ▼  HTTPS / TLS · HSTS header
    │
    ▼  Rate limiting (Redis-backed, per IP + per user)
    │
    ▼  JWT Authentication  (@Public() skips this layer)
    │
    ▼  RBAC Authorization  (@Roles(Role.ADMIN) enforces)
    │
    ▼  Input validation (class-validator, whitelist: true)
    │
    ▼  Business logic
    │
    ├──► PostgreSQL
    └──► Object Storage (private bucket · signed URLs · encrypted at rest)
```

| Control | Detail |
|---------|--------|
| Passwords | bcrypt, cost factor ≥ 12 |
| Tokens | Short-lived JWT (15m) + refresh rotation (7d) |
| KYC docs | Private S3 bucket, signed URLs, access-logged |
| Webhooks | HMAC signature verified on every inbound call |
| Audit log | All admin state changes written to `audit_logs` |

---

## 8. Scalability Path

```
Stage 1 — MVP  (Now)
  Next.js → NestJS → PostgreSQL + Redis + Storage

Stage 2 — Growing Traffic
  Load Balancer → [NestJS × N] → PostgreSQL (+ read replicas)

Stage 3 — Hotspot Extraction (only when metrics justify)
  ├── Search  → Meilisearch / Elasticsearch
  ├── Payments → standalone service
  └── Messaging → WebSocket service
```

The modular monolith is intentional — module boundaries are already drawn. Extraction is a deployment concern, not a rewrite.

---

## 9. Project Milestones

> 📅 **Start:** August 19, 2026 &nbsp;·&nbsp; **Deadline:** November 19, 2026
> Use `- [x]` to mark items complete. Branch from `develop` for every feature.

---

### 🏗️ Phase 1 — Foundation `Aug 19 – Sep 16`

#### Week 1 &nbsp;·&nbsp; Aug 19–26 &nbsp;·&nbsp; Project Setup
- [ ] Repository pushed to GitHub with `main` + `develop` branches
- [ ] Branch protection rules enabled on `main`
- [ ] CI pipeline green (lint · typecheck · build)
- [ ] Docker Compose for PostgreSQL + Redis working locally
- [ ] ORM configured (TypeORM / Prisma) and DB connection verified
- [ ] `.env.example` reviewed and shared with team

#### Week 2 &nbsp;·&nbsp; Aug 26 – Sep 2 &nbsp;·&nbsp; Identity Module
- [ ] `users`, `roles`, `user_roles`, `refresh_tokens` migrations
- [ ] `POST /api/v1/auth/register` — email + password signup
- [ ] `POST /api/v1/auth/login` — returns access + refresh JWT
- [ ] `POST /api/v1/auth/refresh` — token rotation
- [ ] `POST /api/v1/auth/logout` — refresh token revocation
- [ ] Email verification flow (token send + verify endpoint)
- [ ] Password reset flow (request token + reset endpoint)
- [ ] `@Public()` and `@Roles()` decorators wired and tested
- [ ] Unit tests ≥ 80% coverage for AuthService

#### Week 3 &nbsp;·&nbsp; Sep 2–9 &nbsp;·&nbsp; Mentor Module
- [ ] `mentor_profiles`, `mentor_applications`, `mentor_kyc` migrations
- [ ] `POST /mentor/apply` — application submission
- [ ] `GET /mentor/application/status` — applicant self-view
- [ ] KYC document upload → private object storage bucket
- [ ] Admin: `GET /admin/applications` — list pending
- [ ] Admin: `PATCH /admin/applications/:id` — approve / reject
- [ ] Email notification on application status change
- [ ] Unit tests for MentorService + VettingService

#### Week 4 &nbsp;·&nbsp; Sep 9–16 &nbsp;·&nbsp; Marketplace & Search
- [ ] `categories`, `skills`, `plans`, `one_off_sessions` migrations
- [ ] `POST /mentor/plans` — mentor creates a plan
- [ ] `GET /mentors` — public directory, paginated
- [ ] `GET /mentors/:slug` — public profile
- [ ] Full-text + trigram search on mentor profiles
- [ ] Category + skill filter query params
- [ ] `GET /categories` + `GET /skills` taxonomy endpoints
- [ ] Integration tests for SearchService

---

### ⚙️ Phase 2 — Core Features `Sep 16 – Oct 21`

#### Week 5 &nbsp;·&nbsp; Sep 16–23 &nbsp;·&nbsp; Scheduling
- [ ] `availability`, `blackout_dates`, `bookings` migrations
- [ ] `POST /mentor/availability` — set weekly recurring schedule
- [ ] `GET /mentors/:id/slots` — available slots (timezone-aware)
- [ ] `POST /bookings` — reserve a slot (DB-level lock)
- [ ] `PATCH /bookings/:id/cancel` — cancellation with business rules
- [ ] Meeting link (Google Meet / Zoom URL) attached to confirmed booking
- [ ] Booking confirmation email sent to both parties

#### Week 6 &nbsp;·&nbsp; Sep 23–30 &nbsp;·&nbsp; Mentorship Lifecycle
- [ ] `mentorship_applications`, `mentorships` migrations
- [ ] `POST /mentorships/apply` — mentee applies to mentor
- [ ] `PATCH /mentorships/:id/accept` — mentor accepts application
- [ ] Free intro call flow (no payment required)
- [ ] `PATCH /mentorships/:id/activate` — triggered post-payment
- [ ] `PATCH /mentorships/:id/complete` and `cancel`
- [ ] State machine unit tests covering all valid transitions

#### Week 7 &nbsp;·&nbsp; Sep 30 – Oct 7 &nbsp;·&nbsp; Payments
- [ ] `payments`, `payment_events`, `refunds` migrations
- [ ] `IPaymentProvider` interface enforced on all adapters
- [ ] `MtnMomoAdapter` — sandbox integration complete
- [ ] `OrangeMoneyAdapter` — sandbox integration complete
- [ ] `POST /payments/checkout` — initiate intent with idempotency key
- [ ] `POST /payments/webhook` — signature verify + idempotency check
- [ ] Commission calculation on confirmed payment (DB transaction)
- [ ] `commission_records` ledger written atomically
- [ ] Payment retry job in BullMQ with exponential backoff
- [ ] End-to-end payment flow tested in sandbox environment

#### Week 8 &nbsp;·&nbsp; Oct 7–14 &nbsp;·&nbsp; Messaging
- [ ] `conversations`, `messages`, `message_attachments` migrations
- [ ] Authorization: only active mentorship/application participants can message
- [ ] `GET /conversations` — authenticated user inbox
- [ ] `POST /conversations/:id/messages` — send message
- [ ] `GET /conversations/:id/messages` — paginated history
- [ ] `POST /messages/attachments` — upload to object storage
- [ ] Flag message endpoint for moderation

#### Week 9 &nbsp;·&nbsp; Oct 14–21 &nbsp;·&nbsp; Notifications & Payouts
- [ ] `notifications`, `payout_batches`, `payout_transactions` migrations
- [ ] In-app notification create + mark-read endpoints
- [ ] Email templates: welcome · booking confirmed · payment received · payout sent
- [ ] BullMQ `email-queue` + `notification-queue` workers deployed
- [ ] `GET /payouts/balance` — mentor views available earnings
- [ ] `POST /payouts/request` — mentor requests payout
- [ ] Async payout batch processing via BullMQ worker
- [ ] Payout reconciliation on provider callback

---

### 🚀 Phase 3 — Polish & Launch `Oct 21 – Nov 19`

#### Week 10 &nbsp;·&nbsp; Oct 21–28 &nbsp;·&nbsp; Reviews & Administration
- [ ] `reviews`, `disputes`, `audit_logs` migrations
- [ ] `POST /reviews` — mentee submits post-session review
- [ ] Mentor average rating recomputed on new review
- [ ] Admin: user suspend · activate · delete with audit log
- [ ] Admin: dispute create + resolution endpoints
- [ ] Admin: moderation queue (messages + reviews)
- [ ] Admin: platform configuration (feature flags)
- [ ] Admin: analytics endpoints — revenue · signups · active mentorships

#### Week 11 &nbsp;·&nbsp; Oct 28 – Nov 4 &nbsp;·&nbsp; Hardening
- [ ] All public endpoints rate-limited (Redis-backed)
- [ ] Financial flows covered by unit + integration tests
- [ ] E2E test suite: signup → vetting → booking → payment → review
- [ ] OWASP Top 10 checklist reviewed and addressed
- [ ] `npm audit` — zero high-severity findings
- [ ] Sentry error tracking integrated
- [ ] Structured request logging with correlation IDs
- [ ] `GET /health` — liveness + readiness check
- [ ] Graceful shutdown on `SIGTERM`

#### Week 12 &nbsp;·&nbsp; Nov 4–11 &nbsp;·&nbsp; Staging
- [ ] Staging environment deployed (separate DB · Redis · Storage)
- [ ] Staging uses sandbox payment credentials only
- [ ] All CI jobs green on staging deployments
- [ ] Migrations run cleanly on staging database
- [ ] Load test: 100 concurrent users, API p95 < 300 ms
- [ ] Backup procedure documented and restore tested
- [ ] On-call runbook written

#### Week 13 &nbsp;·&nbsp; Nov 11–19 &nbsp;·&nbsp; Production Launch 🎉
- [ ] Production infrastructure provisioned (African / EU region)
- [ ] Secrets in secrets manager — no `.env` files in production
- [ ] DNS configured · HTTPS/TLS active · HSTS header set
- [ ] Cloudflare WAF rules active
- [ ] Production payment credentials activated and verified
- [ ] Smoke test: real end-to-end payment flow in production
- [ ] Monitoring dashboards live (p95 · error rate · queue depth · DB connections)
- [ ] Alerts configured (error rate spike · webhook failures · queue backlog)
- [ ] RPO / RTO values agreed and documented
- [ ] `v1.0.0` tag pushed to `main`
- [ ] **🚀 Mentoraura Backend v1.0.0 is LIVE**

---

## Milestone Progress

| Phase | Period | Items | Status |
|-------|--------|-------|--------|
| 🏗️ Phase 1 — Foundation | Aug 19 – Sep 16 | 26 tasks | 🔲 In Progress |
| ⚙️ Phase 2 — Core Features | Sep 16 – Oct 21 | 30 tasks | 🔲 Not Started |
| 🚀 Phase 3 — Polish & Launch | Oct 21 – Nov 19 | 24 tasks | 🔲 Not Started |

---

> **Last updated:** August 19, 2026
> **Owner:** Backend Team
> **Branch strategy:** all features branch from `develop` · PRs require CI green · merge to `main` on release only
