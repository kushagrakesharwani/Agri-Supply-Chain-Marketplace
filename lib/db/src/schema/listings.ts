import { createInsertSchema } from "drizzle-zod";
import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const listingsTable = pgTable(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    cropType: varchar("crop_type", { length: 100 }).notNull(),
    quantity: decimal("quantity", {
      precision: 12,
      scale: 3,
      mode: "number",
    }).notNull(),
    availableQuantity: decimal("available_quantity", {
      precision: 12,
      scale: 3,
      mode: "number",
    }).notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    pricePerUnit: decimal("price_per_unit", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    location: text("location").notNull(),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("listings_crop_type_idx").on(table.cropType),
    index("listings_price_idx").on(table.pricePerUnit),
    index("listings_seller_idx").on(table.sellerId),
  ],
);

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  availableQuantity: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;