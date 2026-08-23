# Mentoraura Backend — Development & Contribution Guidelines

Welcome to the Mentoraura backend engineering team! To maintain high code quality, consistency, and reliability across our 3-person team and external contributors, everyone must adhere to the rules in this document.

---

## 1. Branching & Git Workflow

### Branch Naming Conventions
- **Feature**: `feat/<short-description>` (e.g., `feat/reviews-module`)
- **Fix**: `fix/<short-description>` (e.g., `fix/jwt-expiration-bug`)
- **Refactor**: `refactor/<short-description>` (e.g., `refactor/payment-webhook-handler`)
- **Documentation**: `docs/<short-description>` (e.g., `docs/update-database-design`)

### Workflow Rule
1. **Never push directly to `main`**. All work happens on feature branches.
2. Open a Pull Request (PR) against `main`.
3. Require at least **1 approving review** from a teammate before merging.
4. Keep branches short-lived and PRs focused on single concerns.

---

## 2. Conventional Commit Messages

All commit messages **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

`<type>(<scope>): <short summary>`

### Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `docs`: Documentation only changes
- `test`: Adding or correcting tests
- `chore`: Maintenance tasks (deps, config)

### Examples:
- `feat(reviews): implement review creation service and endpoint`
- `fix(auth): handle expired refresh token error response`
- `docs(db): update database-design.md with index for reviews table`

---

## 3. Database Schema Changes & Migration Policy

Our executable database source of truth is **Prisma**.

### ⚠️ Strict Rule for Schema Changes:
When adding or modifying database tables/columns:

1. **Step 1 — Document**: First update `docs/database-design.md` with the proposed changes.
2. **Step 2 — Update Schema**: Modify `prisma/schema.prisma`.
3. **Step 3 — Create Migration**: Run `npx prisma migrate dev --name <change_name>` using `DIRECT_URL`.
4. **Step 4 — Update Code**: Update NestJS entities, DTOs, services, and tests.
5. **Step 5 — PR Review**: Submit PR including both `docs/database-design.md` and `prisma/migrations/`.

*Never alter the database manually in Supabase UI without a corresponding Prisma migration file.*

---

## 4. NestJS Architecture Standards

We follow NestJS modular architecture with high encapsulation:

- **Modules**: Grouped by domain context (`modules/identity`, `modules/marketplace`, `modules/payments`, etc.).
- **Controllers**: Handlers for HTTP routes only. Perform no direct database calls or heavy logic.
- **Services**: Contain pure business logic and interact with `PrismaService`.
- **DTOs (Data Transfer Objects)**: All input payloads **must** be validated using `class-validator` and `class-transformer`.
- **Environment Variables**: Managed via `@nestjs/config`. Never hardcode secrets or connection strings.

---

## 5. Testing & Code Quality Requirements

Before submitting any PR, run the following checks locally:

```bash
# 1. Format code
npm run format

# 2. Lint code
npm run lint

# 3. Compile TypeScript check
npm run build

# 4. Run tests
npm run test
```

### PR Requirements:
- Zero linting or TypeScript compilation errors.
- New services/endpoints should include corresponding unit tests (`*.spec.ts`).
- Verify PRs build cleanly in GitHub Actions CI pipeline.

---

## 6. PR Review Checklist (For Reviewers)

When reviewing a teammate's PR, verify:
- [ ] Code follows project module structure.
- [ ] DTOs are validated with `class-validator`.
- [ ] DB changes have updated `docs/database-design.md` and Prisma migrations.
- [ ] No hardcoded secrets or environment variables.
- [ ] Commit history is clean and uses conventional commit formats.
