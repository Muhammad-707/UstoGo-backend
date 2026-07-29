# Folder Structure — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

---

## 1. Repository Root

```
ustogo-backend/
├── .github/workflows/          # CI pipelines
├── .husky/                     # git hooks
├── docs/                       # THIS documentation set — source of truth
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│       ├── seed.ts
│       ├── cities.seed.ts
│       └── categories.seed.ts
├── src/
├── test/
│   ├── e2e/
│   ├── fixtures/
│   └── helpers/
├── .editorconfig
├── .env.example
├── .gitattributes              # pins LF so hooks survive Windows → Linux CI
├── .gitignore
├── .prettierrc
├── .prettierignore
├── commitlint.config.cjs
├── docker-compose.yml
├── Dockerfile
├── eslint.config.mjs           # ESLint 9 flat config
├── jest.config.ts
├── nest-cli.json
├── openapi.json                # generated, committed, diffed in CI
├── package.json
├── tsconfig.json
├── tsconfig.build.json         # build scope: src/ only, tests excluded
├── CLAUDE.md                   # agent operating instructions
└── README.md
```

`docs/` is committed at the root, not inside `src/`, because it is read by people and agents before any code exists.

ESLint configuration lives in `eslint.config.mjs`, not the `.eslintrc.cjs` this document originally specified. ESLint 9 makes flat config the default and ESLint 10 removes `.eslintrc` support entirely; pinning to a format with a scheduled removal date would have bought one familiar filename at the cost of a forced migration. The rule set in `CODING_STANDARDS.md` §12 is unchanged — only the file that carries it.

---

## 2. `src/`

```
src/
├── main.ts                     # bootstrap only — no logic
├── app.module.ts               # root module wiring
├── bootstrap/
│   ├── swagger.ts
│   ├── validation.ts
│   ├── security.ts             # helmet, cors, body limits
│   └── shutdown.ts             # graceful SIGTERM drain
│
├── config/
│   ├── config.module.ts
│   ├── app-config.service.ts
│   ├── env.schema.ts           # Zod schema + pure parseEnv()
│   ├── load-env.ts             # .env discovery, memoised; the only process.env read
│   ├── invalid-environment.exception.ts
│   └── configurations/         # app, database, jwt, storage, mail, redis, throttle
│
├── common/
│   ├── common.module.ts
│   ├── decorators/             # @CurrentUser @Roles @Public @ApiAuth @ApiPaginatedResponse
│   ├── guards/                 # jwt-auth.guard.ts  roles.guard.ts
│   ├── filters/                # global-exception.filter.ts  prisma-exception.mapper.ts
│   ├── interceptors/           # logging  transform  timeout  audit
│   ├── middleware/             # request-id.middleware.ts
│   ├── pipes/
│   ├── validators/             # custom class-validator constraints
│   ├── exceptions/             # AppException + generic subclasses
│   ├── dto/                    # PaginationQueryDto  PaginatedDto  ErrorResponseDto
│   ├── types/                  # AuthenticatedUser, JwtPayload, …
│   ├── constants/
│   └── utils/
│
├── prisma/
│   ├── prisma.module.ts
│   ├── prisma.service.ts
│   ├── transaction.manager.ts
│   └── extensions/
│       └── soft-delete.extension.ts
│
├── modules/                    # ← all business features live here
│   ├── auth/
│   ├── users/
│   ├── files/
│   ├── categories/
│   ├── masters/
│   ├── services/
│   ├── schedule/
│   ├── search/
│   ├── bookings/
│   ├── reviews/
│   ├── notifications/
│   ├── chat/
│   ├── banners/
│   ├── audit/
│   └── admin/
│
├── jobs/
│   ├── jobs.module.ts
│   ├── expire-pending-bookings.job.ts
│   ├── cleanup-refresh-tokens.job.ts
│   ├── cleanup-unconfirmed-files.job.ts
│   ├── recalculate-ratings.job.ts
│   └── booking-reminder.job.ts
│
├── shared/
│   ├── storage/                # StorageProvider interface + S3 implementation
│   ├── mail/
│   ├── events/                 # base event class, event names registry
│   └── logger/
│
├── health/
└── cli/
    ├── main.cli.ts             # entry point: argv parsing, exit codes
    ├── cli.module.ts
    ├── cli.exceptions.ts       # CommandFailedException — operator error, not a defect
    ├── prompt.ts               # stdin behind an interface, so commands test without a TTY
    └── commands/
        └── create-admin.command.ts
```

---

## 3. Feature Module Layout

Every module under `src/modules/` follows the same shape. Directories that would be empty are omitted — an empty `validators/` folder is noise, not consistency.

```
modules/bookings/
├── bookings.module.ts
├── README.md
│
├── controllers/
│   ├── bookings.controller.ts
│   └── admin-bookings.controller.ts
│
├── services/
│   ├── bookings.service.ts
│   ├── booking-creation.service.ts
│   └── booking-transition.service.ts
│
├── domain/
│   ├── booking-state-machine.ts
│   └── booking-policies.ts
│
├── repositories/
│   ├── bookings.repository.interface.ts
│   └── bookings.prisma.repository.ts
│
├── dto/
│   ├── requests/
│   │   ├── create-booking.dto.ts
│   │   ├── cancel-booking.dto.ts
│   │   └── query-bookings.dto.ts
│   └── responses/
│       ├── booking.response.dto.ts
│       └── booking-history.response.dto.ts
│
├── events/
│   ├── booking-created.event.ts
│   └── booking-accepted.event.ts
│
├── exceptions/
│   ├── booking-not-found.exception.ts
│   ├── slot-not-available.exception.ts
│   └── illegal-transition.exception.ts
│
├── guards/
├── constants/
│   └── booking.constants.ts
├── enums/
├── types/
└── __tests__/
    ├── booking-state-machine.spec.ts
    ├── booking-creation.service.spec.ts
    └── booking-transition.service.spec.ts
```

### What belongs where

| Directory        | Contains                                          | Does not contain                              |
| ---------------- | ------------------------------------------------- | --------------------------------------------- |
| `controllers/`   | Routing, Swagger annotations, delegation          | Business rules, Prisma, `if (role === …)`     |
| `services/`      | Business rules, orchestration, transactions       | HTTP decorators, `Request`/`Response` objects |
| `domain/`        | Pure logic: state machines, policies, calculators | Any import from `@nestjs/*` or Prisma         |
| `repositories/`  | Query composition, Prisma calls                   | Business rules                                |
| `dto/requests/`  | Input shape + validation + `@ApiProperty`         | Logic, database access                        |
| `dto/responses/` | Output shape + field-level exposure policy        | Logic                                         |
| `events/`        | Immutable event payload classes                   | Handlers (those live in the consuming module) |
| `exceptions/`    | Named domain exceptions extending `AppException`  | Generic `Error`                               |
| `constants/`     | Frozen literals, limits, defaults                 | Configuration read from the environment       |

---

## 4. Tests

```
src/modules/<feature>/__tests__/     # unit tests, colocated with the code
test/
├── e2e/
│   ├── auth.e2e-spec.ts
│   ├── bookings.e2e-spec.ts
│   └── …
├── fixtures/                        # factory functions building valid entities
├── helpers/
│   ├── test-app.factory.ts          # boots the Nest app against a Testcontainer
│   ├── auth.helper.ts               # createClient(), createApprovedMaster(), createAdmin()
│   └── authz-matrix.helper.ts       # the six mandatory authorization assertions
└── setup/
```

Unit tests are colocated so a module is self-contained and moving it moves its tests. E2E tests are central because they cross modules by definition.

---

## 5. Naming of Files

| Kind         | Pattern                          | Example                            |
| ------------ | -------------------------------- | ---------------------------------- |
| Module       | `<feature>.module.ts`            | `bookings.module.ts`               |
| Controller   | `<scope>.controller.ts`          | `admin-bookings.controller.ts`     |
| Service      | `<purpose>.service.ts`           | `booking-transition.service.ts`    |
| Repository   | `<entity>.prisma.repository.ts`  | `bookings.prisma.repository.ts`    |
| Interface    | `<name>.interface.ts`            | `bookings.repository.interface.ts` |
| Request DTO  | `<verb>-<entity>.dto.ts`         | `create-booking.dto.ts`            |
| Response DTO | `<entity>.response.dto.ts`       | `booking.response.dto.ts`          |
| Guard        | `<name>.guard.ts`                | `master-approved.guard.ts`         |
| Event        | `<entity>-<past-tense>.event.ts` | `booking-accepted.event.ts`        |
| Exception    | `<condition>.exception.ts`       | `slot-not-available.exception.ts`  |
| Job          | `<action>.job.ts`                | `expire-pending-bookings.job.ts`   |
| Unit test    | `<subject>.spec.ts`              | `booking-state-machine.spec.ts`    |
| E2E test     | `<feature>.e2e-spec.ts`          | `bookings.e2e-spec.ts`             |

Full conventions: `NAMING_CONVENTIONS.md`.

---

## 6. Import Paths

Path aliases are configured in `tsconfig.json`:

```json
{
  "paths": {
    "@/*": ["src/*"],
    "@common/*": ["src/common/*"],
    "@config/*": ["src/config/*"],
    "@modules/*": ["src/modules/*"],
    "@shared/*": ["src/shared/*"],
    "@prisma-lib/*": ["src/prisma/*"]
  }
}
```

- ✅ `import { CurrentUser } from '@common/decorators';`
- ❌ `import { CurrentUser } from '../../../common/decorators';`

Relative imports are permitted only **within** a module. Crossing a module boundary always uses an alias — which makes boundary-crossing visible in code review.

Barrel files (`index.ts`) are used at directory level within a module, but **not** at module root: a module-level barrel invites importing internals and is a common cause of circular imports.

---

## 7. Rules

1. Business code lives under `src/modules/` — nowhere else.
2. `src/common/` never imports from `src/modules/`.
3. `domain/` imports nothing from the framework.
4. No file exceeds 300 lines; split by responsibility, not by arbitrary line count.
5. One exported class per file, named after the file.
6. A new module is registered in `MODULES.md` and `FEATURES.md` in the same commit that creates it.
