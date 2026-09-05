import { createInsertSchema } from "drizzle-zod";
import {
  decimal,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { listingsTable } from "./listings";
import { usersTable } from "./users";

export const orderStatusEnum = pgEnum("order_status", [
  "placed",
  "confirmed",
  "ready",
  "completed",
]);

export const ordersTable = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "restrict" }),
    quantity: decimal("quantity", {
      precision: 12,
      scale: 3,
      mode: "number",
    }).notNull(),
    unitPrice: decimal("unit_price", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    totalAmount: decimal("total_amount", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    deliveryWindow: text("delivery_window"),
    status: orderStatusEnum("status").notNull().default("placed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("orders_buyer_idx").on(table.buyerId),
    index("orders_listing_idx").on(table.listingId),
    index("orders_status_idx").on(table.status),
  ],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;