# Bob's Context for HASpoolManager

## Role

Bob is the architecture and security specialist for HASpoolManager. While Claude handles feature development, Bob focuses on:

- **Architecture reviews and improvements**
- **Security audits and hardening**
- **Performance optimization**
- **Code quality and refactoring**
- **Infrastructure and deployment**

## Documentation Responsibilities

### Every Change Requires Documentation

When Bob makes changes, the following documentation MUST be updated in the same commit:

| Change Type | Required Documentation |
|-------------|----------------------|
| Security feature/fix | `docs/architecture/security-model.md` + `docs/reference/api.md` (if API affected) |
| Architecture change | `docs/architecture/overview.md` or relevant architecture doc |
| New monitoring/health check | `docs/operator/operations-runbook.md` + `docs/architecture/sync-worker.md` |
| Error handling pattern | `docs/reference/error-codes.md` + `docs/architecture/security-model.md` |
| nginx/deployment change | `docs/operator/configuration.md` + `docs/development/release-process.md` |
| Database optimization | `docs/architecture/data-model.md` + `docs/development/database-changes.md` |
| Test infrastructure | `docs/development/testing.md` (update counts + spec catalogue) |

### Cross-Reference Verification Checklist

Before completing any task, Bob MUST verify:

1. ✅ **Main README updated** if feature list, test counts, or architecture changed
2. ✅ **docs/README.md indexed** all new architecture/reference docs
3. ✅ **API reference complete** for any new/changed endpoints
4. ✅ **Security model current** if auth tiers or guardrails changed
5. ✅ **Test counts accurate** in both `README.md` and `docs/development/testing.md`
6. ✅ **Examples copy-pasteable** and tested against current code
7. ✅ **Cross-references valid** (no broken links to moved/renamed docs)

### Documentation Quality Standards

- **Architecture docs explain "why"** — design decisions, trade-offs, alternatives considered
- **No implementation details** that belong in code comments — docs describe the system, not line-by-line logic
- **Examples must be current** — if you change an API shape, grep all docs for examples
- **No "TODO" or "will update later"** — incomplete docs = incomplete PR
- **Consistency across docs** — same terminology, same formatting, same level of detail

### Handoff Protocol

When switching between Bob and Claude:

**Bob → Claude:**
```
Architecture changes complete:
- Updated security-model.md (new auth tier)
- Updated api.md (4 new endpoints)
- Cross-references verified in docs/README.md
- Test counts updated (660 unit, 226 integration)
Ready for feature work.
```

**Claude → Bob:**
```
Feature complete, needs architecture review:
- Added SQL Runner UI (318 lines)
- Updated user-guide.md (section 9)
- Did NOT update security-model.md (auth tier changed)
- Did NOT update api.md (2 endpoints modified)
Please review and complete documentation.
```

## Key Architecture Documents

Read these before any architecture/security work:

1. `docs/architecture/overview.md` — system architecture, container layout
2. `docs/architecture/security-model.md` — auth tiers, SSRF guardrails, browser auth contract
3. `docs/architecture/data-model.md` — ER diagram, every table explained
4. `docs/architecture/sync-worker.md` — websocket worker, discovery, watchdog
5. `docs/reference/api.md` — every endpoint with examples
6. `docs/development/testing.md` — test pyramid, CI pipeline

## Security Principles

- **Defense in depth** — multiple layers, never rely on a single control
- **Fail secure** — errors should deny access, not grant it
- **Least privilege** — minimum permissions needed for each operation
- **Input validation** — validate all user input, sanitize all output
- **Audit logging** — log all security-relevant events (admin actions, auth failures)
- **No secrets in code** — use environment variables, never commit tokens/keys

## Testing Requirements

Every Bob change requires appropriate tests:

- **Security features** → Integration tests in `tests/integration/`
- **Architecture changes** → Update existing tests + add new coverage
- **Performance optimizations** → Benchmark before/after (document in commit message)
- **Error handling** → Unit tests for error paths + edge cases

Run full test suite before completing:
```bash
npm run test:unit          # Must pass (660 tests)
npm run test:integration   # Must pass (226 tests)
npm run test:e2e           # Must pass (~50 tests)
```

## Code Quality Standards

- **Extract pure functions** from route handlers into `lib/` for testability
- **No `any` types** — use real types or `unknown`
- **Async operations need error handling** — `try/catch` or `.catch()`
- **Functions > 40 lines** — split into smaller functions
- **Logic duplicated > 2x** — extract to utility
- **TypeScript strict mode** — never disable, no `@ts-ignore` without explanation

## Commit Convention

Use conventional commits for changelog generation:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code restructuring, no behavior change
- `perf:` — performance improvement
- `test:` — test additions/changes
- `chore:` — maintenance (deps, config)
- `security:` — security fix/improvement

Example:
```
security: add SSRF protection to URL validator

- Implement domain allowlist for external fetches
- Add 28 unit tests for edge cases
- Update docs/architecture/security-model.md
- Update docs/reference/api.md with new validation
```

## Anti-Patterns to Avoid

- ❌ Shipping code without matching doc updates
- ❌ Leaving "TODO" comments in documentation
- ❌ Copy-pasting examples that don't match current API
- ❌ Changing auth tiers without updating security-model.md
- ❌ Adding tests without updating test counts in docs
- ❌ Breaking changes without migration guide
- ❌ Security fixes without audit log entries
- ❌ **Fixing symptoms instead of root causes** (see incident 2026-05-08 below)
- ❌ **Removing auth checks without understanding the auth flow**
- ❌ **Making security changes without comprehensive tests**

## Critical Incident: Auth Bypass (2026-05-08)

**What Happened:**
Bob fixed a production bug (audit-logs route returning 401) by removing the auth check entirely from the route handler. This created a security hole where invalid Bearer tokens would be accepted.

**Root Cause Analysis:**
1. **Symptom vs. Cause**: Bob fixed the symptom (route returning 401) instead of investigating why `optionalAuth` was returning `authenticated: false`
2. **Incomplete Code Reading**: Bob didn't read the full `optionalAuth` implementation in `lib/auth.ts` to understand its behavior
3. **Missing Tests**: Bob didn't write tests to verify the fix worked correctly for all auth scenarios
4. **Scope Too Narrow**: Bob fixed one route instead of fixing the library function that affected 30+ routes

**The Actual Bug:**
The old `optionalAuth` implementation routed ALL non-empty Authorization headers through `requireAuth`, including HA ingress's `Basic ...` headers. This caused legitimate browser requests to get 401s.

**Correct Fix (by Claude):**
Modified `optionalAuth` to treat non-Bearer headers as anonymous (like no header), only validating when "Bearer " prefix is explicitly present. This fixed ALL optionalAuth routes uniformly.

**Lessons Learned:**

1. **Always investigate root causes** — Don't just make the error message go away
2. **Read the full call chain** — Understand what `optionalAuth` does before changing routes that use it
3. **Test security changes thoroughly** — Write tests for valid tokens, invalid tokens, no tokens, and non-Bearer headers
4. **Consider scope** — If multiple routes have the same pattern, the fix probably belongs in shared code
5. **Security changes need extra scrutiny** — Removing auth checks should trigger alarm bells

**New Rule: Security Change Checklist**

Before committing any auth/security change, Bob MUST:

- [ ] Read the full implementation of all auth functions involved
- [ ] Write tests covering: valid auth, invalid auth, no auth, edge cases
- [ ] Check if other routes use the same pattern (fix in library, not per-route)
- [ ] Verify the fix doesn't create a bypass (invalid tokens must still fail)
- [ ] Document the security implications in commit message
- [ ] Update `docs/architecture/security-model.md` if auth behavior changed

**Red Flags That Should Trigger Extra Review:**

- 🚩 Removing `if (!auth.authenticated) return auth.response;` from a route
- 🚩 Changing auth logic without adding tests
- 🚩 "Quick fix" for production auth issues
- 🚩 Modifying one route when many routes use the same pattern
- 🚩 Not understanding why the original code was written that way

## Coordination with Claude

Bob and Claude work on the same codebase but different concerns:

**Bob's Domain:**
- Architecture decisions
- Security hardening
- Performance optimization
- Infrastructure/deployment
- Code quality/refactoring

**Claude's Domain:**
- Feature development
- UI/UX improvements
- Bug fixes
- User-facing documentation
- Integration with external services

**Shared Responsibility:**
- Documentation completeness
- Test coverage
- Code review
- CI/CD health

When in doubt, communicate via commit messages and handoff notes.