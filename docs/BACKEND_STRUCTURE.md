# Backend structure and conventions

How the NestJS backend is laid out and the rules every module follows. Read this before picking up a ticket. Schema-level rules (money, ledger, migrations) are in [PRISMA_SETUP.md](PRISMA_SETUP.md); this document covers the code.

The layering is a port of our Express ERP backend (routes → controllers → services → DAO), adapted to Nest dependency injection. The rules marked **(lint)** fail CI if broken.

## Folder layout

```
src/
  main.ts                  bootstrap: validates env, creates the app, calls configureApp
  app.setup.ts             shared by main.ts and e2e tests: logger, cookies, BigInt JSON
  app.module.ts            imports modules; registers the global filter and interceptor
  config/                  env.schema.ts (Zod) + ConfigModule providing ENV
  prisma/                  PrismaService (pg adapter), TransactionService, TransactionClient type
  health/                  GET /health (infrastructure, not a domain module)
  common/
    auth/                  AuthUser type, TeacherScope + teacherScope()/adminScope()
    errors/                ErrorCode map, AppException, DomainError, constraint messages
    filters/               AllExceptionsFilter (the only place errors become responses)
    guards/                AuthGuard, RolesGuard (registered globally by AuthModule)
    decorators/            @Public(), @Roles(), @CurrentUser()
    interceptors/          ResponseEnvelopeInterceptor
    pipes/                 ZodValidationPipe
    logging/               pino config, redaction
  modules/<module>/
    <module>.module.ts
    controllers/<entity>.controller.ts
    services/<entity>.service.ts
    dao/<entity>.dao.ts
    schemas/<entity>.schema.ts
    domain/<entity>.rules.ts      only where there are state transitions or invariants
test/                      e2e tests (*.e2e-spec.ts) + utils
```

Modules follow the backlog's **Module** field (Auth, Courses, Catalogue, Orders, Ledger, ...). Create a module when its first ticket starts, not before. Unit tests sit next to the file they test (`x.rules.spec.ts`).

## The layers

### Controller

- Declares the route, guards (`@Roles`, `@Public`) and validation (`ZodValidationPipe` per argument).
- Reads the caller with `@CurrentUser()`.
- Calls **exactly one** service method and returns its result. It does not wrap it: the global interceptor turns it into `{ success: true, data }`.
- Never imports a DAO, `PrismaService` or `TransactionService`. **(lint)**
- May touch `Request`/`Response` only for HTTP concerns (cookies, IP, user agent). Pass plain values to the service.

```ts
@Roles([Role.TEACHER])
@Controller('teacher/courses')
export class TeacherCoursesController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
  ): Promise<CourseRecord> {
    return this.courseService.createCourse(user, body);
  }
}
```

### Service

- `@Injectable()` class with the module's business rules: existence checks, uniqueness, "cannot do X while Y", and every authorisation decision about a **specific record**.
- Throws `AppException(ErrorCode.X, info?)` or lets a `DomainError` from the rules propagate.
- Calls DAOs. Never imports `PrismaService` **(lint)**, `express` **(lint)**, or another module's DAO **(lint)**. To use another module, import that module and inject its exported service.
- Multi-step writes go through `TransactionService.run(async (tx) => ...)`, passing `tx` to every DAO call inside. Anything that moves money must do this.
- Re-exports the record types it returns (`export type { CourseRecord }`) so controllers never import from `dao/`.
- Methods are `async` even when they just delegate, so failures always reject rather than throw synchronously.

### DAO

- `@Injectable()` class, the **only** place Prisma is called.
- Small methods named by what they do: `createX(data, tx?)`, `getXBy(where)`, `getXsBy(where, page)`, `updateX(id, data, tx?)`, `deleteX(id, tx?)`, `countYBy(where)`.
- Every write takes an optional last argument `tx?: TransactionClient` and uses `(tx ?? this.prisma)`.
- Uses an explicit `select` and exports the resulting payload type. Never selects `passwordHash` except in the one auth method that checks a password.
- No business logic. Translating "no row matched" into `null` is fine; deciding what that means is the service's job.

### Schemas

- Zod schemas per entity: create, update, params, query. Export `z.infer` types next to them.
- Use `z.strictObject` for bodies so unknown keys (e.g. a spoofed `teacherId`) are rejected.
- Field names are camelCase, matching Prisma.
- Money: `z.string().regex(/^\d{1,18}$/).transform(BigInt)`. Never accept money as a JSON number.

### Domain rules

- `domain/<entity>.rules.ts`: pure functions plus typed errors extending `DomainError`. No Nest, no Prisma, no I/O. **(lint)**
- Shape: `decideX(current, input, now) => change`. The service loads the record, asks the rules what changes, and persists the change. Pass `now` in; don't call `new Date()` inside rules.
- Every rule file has a unit test covering each valid and invalid case.
- Example: `courses/domain/course.rules.ts`, which holds the course state machine and the publish guard.

### Module contract

A module's `exports` array is its public API. **Export services only, never DAOs.** Courses imports `ReferenceDataModule` and injects `ReferenceDataService`. It never touches `ReferenceDataDao`.

## Teacher scoping (#14)

Teacher-owned data (courses, sections, lessons, enrollments, student records, earnings) is scoped in the data layer, not in routes.

- Every DAO method that reads or writes teacher-owned data takes a `TeacherScope` as its **first, required** argument:
  ```ts
  type TeacherScope = { teacherId: string } | { admin: true };
  ```
  There is no overload without it, so forgetting the scope is a compile error.
- The DAO combines the scope with `AND: [where, scopeWhere(scope)]`, so a caller-supplied `where` cannot widen it.
- Create methods take `TeacherOwnerScope` (`{ teacherId }`) and set `teacherId` from the scope, never from input.
- Services build scopes with `teacherScope(user)` or `adminScope(user)`. Both re-check the role, so a scope can never be wider than the caller's roles, even if a route's `@Roles` is wrong.
- Which scope to use depends on the endpoint, not the user. An ADMIN+TEACHER user calling `/teacher/courses` is scoped as a teacher.
- A record outside the caller's scope returns **404**, not 403, so other teachers' ids are not revealed.
- Never write an unscoped `findMany({})` on teacher-owned data.

## Auth (#10, #12)

- Sessions are server-side (`sessions` table). The HTTP-only cookie holds a random 256-bit token; only its SHA-256 hash is stored. Logout sets `revoked_at`. Password reset (#13) should call `SessionDao.revokeSessionsBy({ userId }, now, tx)`.
- Sessions have both an absolute expiry (`SESSION_TTL_HOURS`) and an idle expiry (`SESSION_IDLE_TIMEOUT_MINUTES`), and are rotated on login.
- `AuthGuard` is global. Every route needs a live session unless it is marked `@Public()`.
- `RolesGuard` is global. `@Roles([Role.ADMIN])` means "holds at least one of these roles". Roles come from `user_roles` as a set, so one user can be ADMIN and TEACHER.
- `@CurrentUser()` gives `AuthUser { id, email, roles: ReadonlySet<Role>, sessionId }`.

## Errors

- Add a code to `ErrorCode` + `ERROR_DEFINITIONS` (status and default message), then throw `new AppException(ErrorCode.X, info, extended, { message?, cause? })`.
- `info` and `extended` are returned to the client. Only `cause` stays server-side.
- Domain errors set `code` to an `ErrorCode` value, which the filter maps to its status. An unknown code maps to 422.
- The filter returns `{ success: false, error: { name, message, info, extended } }`, and maps Prisma errors:

  | Prisma          | HTTP | ErrorCode              |
  | --------------- | ---- | ---------------------- |
  | P2002           | 409  | `CONFLICT`             |
  | P2003 (FK)      | 400  | `INVALID_REFERENCE`    |
  | P2025           | 404  | `NOT_FOUND`            |
  | CHECK (`23514`) | 409  | `CONSTRAINT_VIOLATION` |
  | anything else   | 500  | `INTERNAL`             |

  Constraint-specific messages live in `common/errors/constraint-messages.ts`. Raw Prisma messages never reach clients.

- Prefer checking a rule in the service or domain first, for a precise message. Database constraints are the backstop.

## Logging

- Structured JSON (pino) in production, pretty-printed in development.
- Every line written during a request carries `reqId`, which matches the `x-request-id` response header. Clients may send their own id.
- The filter logs 4xx as `warn` and 5xx as `error` (with stack), plus method, path, user id and the request body with `password|token|secret|cookie|authorization` keys redacted.
- To log from a service, inject `PinoLogger` via `@InjectPinoLogger(MyService.name)` and log objects: `this.logger.info({ orderId }, 'Order verified')`.

## Money

- `BigInt` minor units end to end. Never `Number`, never floats.
- Over JSON it is a string (`"150000"`), via the `BigInt.prototype.toJSON` patch in `app.setup.ts`.
- When writing to a JSON column (`audit_log.details`), convert with `.toString()` yourself.
- Ledger and transaction rules are in [PRISMA_SETUP.md §8](PRISMA_SETUP.md).

## Audit log

State changes an admin will need to explain later write a row to `audit_log` in the **same transaction**: actor, action (`COURSE_APPROVED`), entity type and id, and `details`, which holds reasons and from/to. For now `AuditLogDao` lives in the courses module. The audit log ticket (#107) moves it to a shared module.

When users need to see an audit detail, the service reads it back for records already loaded through the caller's scope, as `CourseService` does for `rejectionReason`. Never query `audit_log` by an id the caller has not been authorised for.

## Testing

| Kind         | Where                       | Runs with          | Database                 |
| ------------ | --------------------------- | ------------------ | ------------------------ |
| Domain rules | `src/**/domain/*.spec.ts`   | `npm test`         | none                     |
| Services     | `src/**/services/*.spec.ts` | `npm test`         | none: DAOs mocked        |
| HTTP / e2e   | `test/*.e2e-spec.ts`        | `npm run test:e2e` | `TEST_DATABASE_URL` only |

- Service tests construct the service directly with mocked DAOs and a `TransactionService` whose `run` calls the callback with a fake `tx`. Assert that `tx` is passed to every DAO write.
- e2e tests boot the real `AppModule` through `createTestApp()` and log in with `loginAs(app, SEEDED.teacherA)`. The test database is migrated and seeded automatically.
- e2e tests must not assume an empty database. Create what you need and use unique titles.

## Adding an endpoint: checklist

1. Read the issue's **Done when** bullets.
2. Schema in `schemas/`, using a strict object and camelCase.
3. If there is a state change or invariant, write a pure function in `domain/` with a unit test.
4. DAO method: explicit `select`, `tx?` on writes, `TeacherScope` if the data is teacher-owned.
5. Service method: load, decide (rules), persist (transaction if more than one write), audit if it's an admin decision.
6. Controller method: guards, pipes, one service call.
7. e2e test for the happy path and for access control.
8. `npm run lint && npm run typecheck && npm test && npm run test:e2e`.
9. Commit with `refs #N`. Don't use `closes`: an issue closes after staging.

## Git

- One branch per ticket or step, named `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `test/<issue>-<slug>` or `chore/<issue>-<slug>`.
- Commit messages: `feat(courses): add state transition rules (refs #25)`.
- Schema changes need a migration (`npx prisma migrate dev --name <change>`, then `npx prisma generate`) and an entry in PRISMA_SETUP.md if they depart from Schema v2.0.
