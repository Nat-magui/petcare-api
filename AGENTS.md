# PetCare API — Agent Instructions

## 1. Purpose

This repository contains **PetCare API V1**, the backend for IntegrarTEC — Integrador 4.

Codex may assist with implementation, refactoring, tests and documentation, but it must not invent product behavior or expand the V1 scope.

---

## 2. Source of truth

Before implementing any task, read:

1. `docs/specification.md`
2. `docs/implementation-plan.md`

For detailed behavior, consult the project baseline documents in `docs/`:

- `01-functional-specification.pdf`
- `02-business-rules-errors.pdf`
- `03-use-cases-flows.pdf`

The Markdown specification is the operational entry point.

The PDFs contain the detailed contract, business rules, errors, use cases and flows.

If a task conflicts with the specification, **the specification wins**.

If required behavior is not defined, **stop and report the ambiguity instead of inventing a solution**.

---

## 3. Frozen V1 domain

PetCare V1 contains only these domain resources:

- `User`
- `Pet`
- `PetAccess`
- `Vaccination`

Pet access roles are limited to:

- `OWNER`
- `CAREGIVER`
- `VIEWER`

Do not create additional roles or domain entities unless the specification is explicitly updated first.

---

## 4. Out of scope

Do not add features that are outside PetCare V1, including:

- frontend or mobile application;
- veterinarians as authenticated/domain entities;
- appointments;
- medical records;
- medications or treatments;
- organizations/ONG as authenticated entities;
- email invitations;
- notifications or reminders;
- uploads, images or documents;
- payments;
- AI or RAG;
- pagination;
- vaccination `upcoming` / `overdue` filters;
- sessions per device;
- refresh-token rotation;
- access-token blacklist.

Do not add features simply because they may be useful in the future.

---

## 5. Technology stack

Use the stack already established by the project:

- NestJS 11
- TypeScript
- ESM
- pnpm
- Vitest
- Prisma
- PostgreSQL
- class-validator
- class-transformer
- bcrypt
- JWT
- Swagger / OpenAPI

Do not replace core technologies without explicit instruction.

---

## 6. Architecture

Follow the NestJS separation of responsibilities:

```text
HTTP Request
    ↓
Controller
    ↓
Service
    ↓
PrismaService
    ↓
PostgreSQL
```

### Controllers

Controllers handle HTTP concerns:

- routes;
- parameters;
- request DTOs;
- status codes;
- delegation to Services.

Controllers should remain thin.

### Services

Services contain:

- business rules;
- authorization decisions;
- transactions;
- orchestration;
- persistence calls through Prisma.

Do not place business rules directly in Controllers.

### Prisma

Prisma is the persistence layer.

Business decisions must not depend on Prisma-specific behavior that contradicts the specification.

---

## 7. API conventions

Base path:

```text
/api/v1
```

Use:

- JSON UTF-8;
- camelCase property names;
- UUID identifiers;
- semantic string enums;
- PATCH for partial updates.

Business dates use `YYYY-MM-DD`.

Technical timestamps use ISO 8601.

Successful endpoints normally return the resource or collection directly.

DELETE endpoints defined by the specification return `204 No Content`.

---

## 8. Authentication rules

PetCare V1 uses:

- short-lived access JWT (~15 minutes);
- refresh JWT (~7 days);
- one active refresh session per user;
- persisted `refreshTokenHash`;
- no refresh rotation in `/auth/refresh`;
- logout invalidates the stored refresh hash;
- an already-issued access token may remain valid until expiration.

Do not introduce:

- session tables;
- multi-device sessions;
- refresh rotation;
- access-token blacklist.

---

## 9. Authorization rules

Authorization for pets is based on `PetAccess`.

Do not use `Pet.ownerId`.

The relationship is:

```text
User
  ↓
PetAccess
  ↓
Pet
```

A user may have a different role for each Pet.

### OWNER

Can:

- read Pet;
- update Pet;
- delete Pet;
- read Vaccination;
- create Vaccination;
- update Vaccination;
- delete Vaccination;
- manage PetAccess.

### CAREGIVER

Can:

- read Pet;
- update Pet;
- read Vaccination;
- create Vaccination;
- update Vaccination;
- delete Vaccination.

Cannot:

- delete Pet;
- manage PetAccess.

### VIEWER

Can only:

- read Pet;
- read Vaccination.

### Last OWNER invariant

A Pet must always have at least one `OWNER`.

Operations that reduce the number of OWNER users must preserve this invariant and follow the transactional behavior defined by the specification.

Do not introduce `PRIMARY_OWNER`.

All OWNER users have equivalent authority in V1.

---

## 10. Validation

Use global request validation as defined by the specification:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Unknown properties must be rejected.

Do not rely on TypeScript types alone for HTTP validation.

PATCH semantics:

```text
omitted field → preserve current value
nullable field sent as null → clear value
non-null value → replace current value
```

Cross-field business rules must be validated against the final merged state.

---

## 11. Error contract

Controlled PetCare errors follow this structure:

```json
{
  "statusCode": 409,
  "code": "PET_LAST_OWNER",
  "error": "Conflict",
  "message": "La mascota debe conservar al menos un OWNER."
}
```

`details` is optional and is mainly used for validation errors.

Application error codes are defined in the project documentation.

Do not invent new error codes unless a real new scenario has first been added to the specification/business-rules documentation.

Conceptual evaluation order:

1. authentication;
2. input validation;
3. resource existence;
4. resource/role authorization;
5. state conflicts;
6. infrastructure errors.

---

## 12. Security

Never expose or log:

- plaintext passwords;
- `passwordHash`;
- refresh tokens;
- `refreshTokenHash`;
- access JWTs;
- JWT secrets;
- complete `DATABASE_URL`;
- stack traces in production.

Secrets must come from environment variables.

Do not commit `.env`.

`.env.example` must contain placeholders only.

---

## 13. Database rules

The V1 relational model contains:

```text
User
Pet
PetAccess
Vaccination
```

Important constraints include:

```text
User.email UNIQUE
PetAccess UNIQUE(userId, petId)
```

`PetAccess` is an explicit many-to-many relation between User and Pet.

Creating a Pet and assigning the creator an OWNER PetAccess is one atomic business operation.

Deleting a Pet must not leave orphaned PetAccess or Vaccination records.

Operations that could remove/degrade the final OWNER must preserve the invariant using the transactional strategy defined by the specification.

---

## 14. Vaccination rules

Vaccination is declarative data only.

Rules:

```text
appliedAt <= current date
```

and, when `nextDueAt` exists:

```text
nextDueAt >= appliedAt
```

For PATCH, validate these rules against the final merged state.

A vaccination route containing both `petId` and `vaccinationId` must operate only when that vaccination belongs to that Pet.

Do not implement clinical recommendation logic.

---

## 15. Swagger

Swagger / OpenAPI is part of PetCare V1.

Implemented endpoints should remain synchronized with the API contract.

Use the tags defined by the project:

- `health`
- `auth`
- `pets`
- `pet-access`
- `vaccinations`

Do not treat Swagger as a replacement for the specification.

---

## 16. Working with tasks

Work only on the scope explicitly requested by the current task.

Do not opportunistically implement future phases.

For example, if the task is:

```text
Bootstrap + Health
```

do not also implement:

```text
Prisma
Auth
Pets
Vaccinations
```

A task should normally contain:

```text
TASK
GOAL
SOURCE OF TRUTH
SCOPE
DO NOT
ACCEPTANCE CRITERIA
VALIDATION
REPORT
```

---

## 17. Validation before completion

Before considering a development task complete, run the relevant project checks.

At minimum, when applicable:

```bash
pnpm lint
pnpm build
```

Run relevant Vitest tests when tests exist.

For database tasks, also run the relevant Prisma validation/migration commands.

For HTTP tasks, verify the expected endpoint manually or through tests.

Do not report a task as complete if validation failed.

---

## 18. Reporting changes

At the end of a task, report:

1. files created or modified;
2. concise explanation of the implementation;
3. validation commands executed;
4. their results;
5. any unresolved ambiguity or deviation.

Do not hide failed checks.

---

## 19. Git discipline

Prefer small, reviewable changes.

Do not modify unrelated files.

Do not commit generated secrets, `.env`, database credentials or tokens.

Do not rewrite the project specification to match an implementation mistake.

Implementation follows the specification, not the opposite.

---

## 20. Core rule

When unsure:

```text
Read the specification.
```

If the specification still does not answer the question:

```text
STOP
↓
report the ambiguity
↓
wait for a product/technical decision
```

Do not guess business behavior.
