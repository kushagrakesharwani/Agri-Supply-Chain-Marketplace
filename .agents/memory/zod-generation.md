---
name: OpenAPI Zod generation
description: Compatibility constraint between Orval-generated validators and the workspace Zod package.
---

The current Orval setup emits Zod 4-style helpers for OpenAPI format keywords such as uuid, email, and uri, while the workspace resolves the default zod import to a Zod 3-compatible API. Avoid those format keywords in the generated contract unless the workspace Zod generation strategy is upgraded; enforce the stricter format at the server boundary when needed.

**Why:** Code generation succeeds, but the chained library typecheck fails when generated code calls helpers unavailable from the installed default zod entrypoint.

**How to apply:** When adding new OpenAPI fields, use the simplest schema compatible with the current generator and keep contract/runtime validation aligned through explicit server guards.