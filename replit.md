# Agri Supply Chain Marketplace

Marketplace APIs that connect farmers and FPOs directly with buyers while making produce quantity, pricing, and order progress transparent.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle source of truth for users, produce listings, and orders
- `lib/api-spec/openapi.yaml` — source of truth for the Marketplace API contract
- `artifacts/api-server/src/routes/marketplace.ts` — Marketplace request validation and business rules

## Architecture decisions

- Listings keep both original quantity and available quantity so placing an order is atomic and stock cannot be oversold.
- Orders snapshot the listing price at placement time so later price edits do not change existing orders.
- Seller roles are restricted to farmers and FPOs; only buyers can place orders.
- Order status transitions are forward-only: Placed → Confirmed → Ready → Completed.

## Product

- Create marketplace users as farmers, FPOs, or buyers.
- Farmers and FPOs can create, update, and delete produce listings.
- Buyers can search listings by crop and price range and place quantity-limited orders.
- Buyers and sellers can view order progress through the four Marketplace statuses.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
