import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateListingBody,
  CreateOrderBody,
  CreateUserBody,
  DeleteListingParams,
  GetListingParams,
  GetOrderParams,
  GetUserParams,
  ListListingsQueryParams,
  ListOrdersQueryParams,
  UpdateListingBody,
  UpdateListingParams,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  listingsTable,
  ordersTable,
  usersTable,
  type User,
} from "@workspace/db";
import { and, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { assessTomatoQuality } from "../lib/crop-quality";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const DEFAULT_DELIVERY_WINDOW = "Next available · 9:00–12:00";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MarketplaceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
type ValidationIssue = { path: (string | number)[]; message: string };
type ValidationError = { issues: ValidationIssue[] };

function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((error: unknown) => {
      if (error instanceof MarketplaceError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      if (isValidationError(error)) {
        const message = error.issues
          .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
          .join(", ");
        res.status(400).json({ error: message });
        return;
      }

      req.log.error({ err: error }, "Marketplace request failed");
      res.status(500).json({ error: "An unexpected server error occurred" });
    });
  };
}

function parseUuid(value: string, fieldName: string): string {
  if (!uuidPattern.test(value)) {
    throw new MarketplaceError(400, `${fieldName} must be a valid UUID`);
  }
  return value;
}

async function getUserOrThrow(id: string, fieldName = "userId"): Promise<User> {
  const userId = parseUuid(id, fieldName);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    throw new MarketplaceError(404, "User not found");
  }

  return user;
}

function assertSeller(user: User) {
  if (user.role !== "farmer" && user.role !== "fpo") {
    throw new MarketplaceError(400, "Only farmers and FPOs can create listings");
  }
}

function assertPositiveQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MarketplaceError(400, "Quantity must be greater than zero");
  }
}

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const body = CreateUserBody.parse(req.body);
    const [user] = await db
      .insert(usersTable)
      .values({
        name: body.name.trim(),
        email: body.email ?? null,
        role: body.role,
      })
      .returning();

    res.status(201).json(user);
  }),
);

router.get(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = GetUserParams.parse(req.params);
    const user = await getUserOrThrow(userId);
    res.json(user);
  }),
);

router.get(
  "/listings",
  asyncHandler(async (req, res) => {
    const query = ListListingsQueryParams.parse(req.query);
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new MarketplaceError(400, "minPrice cannot be greater than maxPrice");
    }

    const conditions = [];
    if (query.cropType?.trim()) {
      conditions.push(ilike(listingsTable.cropType, `%${query.cropType.trim()}%`));
    }
    if (query.minPrice !== undefined) {
      conditions.push(gte(listingsTable.pricePerUnit, query.minPrice));
    }
    if (query.maxPrice !== undefined) {
      conditions.push(lte(listingsTable.pricePerUnit, query.maxPrice));
    }
    if (query.sellerId) {
      conditions.push(
        eq(listingsTable.sellerId, parseUuid(query.sellerId, "sellerId")),
      );
    }

    const listings = await db
      .select()
      .from(listingsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(listingsTable.createdAt));

    res.json(listings);
  }),
);

router.post(
  "/listings",
  asyncHandler(async (req, res) => {
    const body = CreateListingBody.parse(req.body);
    const seller = await getUserOrThrow(body.sellerId, "sellerId");
    assertSeller(seller);
    assertPositiveQuantity(body.quantity);

    let qualityGrade: "Good" | "Medium" | "Poor" | null = null;
    let qualityReason: string | null = null;
    if (
      body.photoUrl &&
      /^(tomato|tomatoes)$/i.test(body.cropType.trim()) &&
      body.photoUrl.startsWith("/api/storage/objects/")
    ) {
      try {
        const objectPath = body.photoUrl.slice("/api/storage".length);
        const file = await objectStorage.getObjectEntityFile(objectPath);
        const [image, metadata] = await Promise.all([file.download(), file.getMetadata()]);
        const mimeType = metadata[0].contentType;
        if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
          throw new MarketplaceError(400, "Listing photos must be JPEG, PNG, or WebP images");
        }
        ({ grade: qualityGrade, reason: qualityReason } = await assessTomatoQuality(image[0], mimeType));
      } catch (error) {
        if (error instanceof MarketplaceError) throw error;
        req.log.error({ err: error }, "Tomato quality assessment failed");
        throw new MarketplaceError(502, "Tomato quality assessment is unavailable. Please try again.");
      }
    }

    const [listing] = await db
      .insert(listingsTable)
      .values({
        sellerId: seller.id,
        cropType: body.cropType.trim(),
        quantity: body.quantity,
        availableQuantity: body.quantity,
        unit: body.unit.trim(),
        pricePerUnit: body.pricePerUnit,
        location: body.location.trim(),
        photoUrl: body.photoUrl ?? null,
        qualityGrade,
        qualityReason,
      })
      .returning();

    res.status(201).json(listing);
  }),
);

router.get(
  "/listings/:listingId",
  asyncHandler(async (req, res) => {
    const { listingId } = GetListingParams.parse(req.params);
    const id = parseUuid(listingId, "listingId");
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);

    if (!listing) {
      throw new MarketplaceError(404, "Listing not found");
    }

    res.json(listing);
  }),
);

router.patch(
  "/listings/:listingId",
  asyncHandler(async (req, res) => {
    const { listingId } = UpdateListingParams.parse(req.params);
    const id = parseUuid(listingId, "listingId");
    const body = UpdateListingBody.parse(req.body);

    if (Object.keys(body).length === 0) {
      throw new MarketplaceError(400, "At least one listing field is required");
    }

    const [existing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, id))
      .limit(1);
    if (!existing) {
      throw new MarketplaceError(404, "Listing not found");
    }

    const soldQuantity = existing.quantity - existing.availableQuantity;
    if (body.quantity !== undefined && body.quantity < soldQuantity) {
      throw new MarketplaceError(
        400,
        `Quantity cannot be less than the ${soldQuantity} already ordered`,
      );
    }

    const updateValues: Partial<typeof listingsTable.$inferInsert> = {};
    if (body.cropType !== undefined) updateValues.cropType = body.cropType.trim();
    if (body.quantity !== undefined) {
      updateValues.quantity = body.quantity;
      updateValues.availableQuantity = body.quantity - soldQuantity;
    }
    if (body.unit !== undefined) updateValues.unit = body.unit.trim();
    if (body.pricePerUnit !== undefined) {
      updateValues.pricePerUnit = body.pricePerUnit;
    }
    if (body.location !== undefined) updateValues.location = body.location.trim();
    if (body.photoUrl !== undefined) updateValues.photoUrl = body.photoUrl;

    const [listing] = await db
      .update(listingsTable)
      .set(updateValues)
      .where(eq(listingsTable.id, id))
      .returning();

    res.json(listing);
  }),
);

router.delete(
  "/listings/:listingId",
  asyncHandler(async (req, res) => {
    const { listingId } = DeleteListingParams.parse(req.params);
    const id = parseUuid(listingId, "listingId");
    const [existingOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.listingId, id))
      .limit(1);

    if (existingOrder) {
      throw new MarketplaceError(
        409,
        "A listing with existing orders cannot be deleted",
      );
    }

    const deleted = await db
      .delete(listingsTable)
      .where(eq(listingsTable.id, id))
      .returning({ id: listingsTable.id });

    if (deleted.length === 0) {
      throw new MarketplaceError(404, "Listing not found");
    }

    res.status(204).send();
  }),
);

router.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const query = ListOrdersQueryParams.parse(req.query);
    const conditions = [];

    if (query.buyerId) {
      conditions.push(
        eq(ordersTable.buyerId, parseUuid(query.buyerId, "buyerId")),
      );
    }
    if (query.status) {
      conditions.push(eq(ordersTable.status, query.status));
    }
    if (query.sellerId) {
      const sellerId = parseUuid(query.sellerId, "sellerId");
      const sellerListings = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(eq(listingsTable.sellerId, sellerId));
      if (sellerListings.length === 0) {
        res.json([]);
        return;
      }
      conditions.push(
        inArray(
          ordersTable.listingId,
          sellerListings.map((listing) => listing.id),
        ),
      );
    }

    const orders = await db
      .select()
      .from(ordersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ordersTable.createdAt));

    res.json(orders);
  }),
);

router.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = CreateOrderBody.parse(req.body);
    const buyer = await getUserOrThrow(body.buyerId, "buyerId");
    if (buyer.role !== "buyer") {
      throw new MarketplaceError(400, "Only buyers can place orders");
    }
    const listingId = parseUuid(body.listingId, "listingId");
    assertPositiveQuantity(body.quantity);

    const order = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listingsTable)
        .where(eq(listingsTable.id, listingId))
        .limit(1);

      if (!listing) {
        throw new MarketplaceError(404, "Listing not found");
      }
      if (listing.sellerId === buyer.id) {
        throw new MarketplaceError(400, "A seller cannot order from their own listing");
      }
      if (body.quantity > listing.availableQuantity) {
        throw new MarketplaceError(
          409,
          `Only ${listing.availableQuantity} ${listing.unit} available`,
        );
      }

      const [updatedListing] = await tx
        .update(listingsTable)
        .set({ availableQuantity: listing.availableQuantity - body.quantity })
        .where(
          and(
            eq(listingsTable.id, listing.id),
            gte(listingsTable.availableQuantity, body.quantity),
          ),
        )
        .returning({ id: listingsTable.id });

      if (!updatedListing) {
        throw new MarketplaceError(
          409,
          "The requested quantity is no longer available",
        );
      }

      const [createdOrder] = await tx
        .insert(ordersTable)
        .values({
          buyerId: buyer.id,
          listingId: listing.id,
          quantity: body.quantity,
          unitPrice: listing.pricePerUnit,
          totalAmount: Math.round(body.quantity * listing.pricePerUnit * 100) / 100,
          deliveryWindow: body.deliveryWindow?.trim() || DEFAULT_DELIVERY_WINDOW,
          status: "placed",
        })
        .returning();

      return createdOrder;
    });

    res.status(201).json(order);
  }),
);

router.get(
  "/orders/:orderId",
  asyncHandler(async (req, res) => {
    const { orderId } = GetOrderParams.parse(req.params);
    const id = parseUuid(orderId, "orderId");
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1);

    if (!order) {
      throw new MarketplaceError(404, "Order not found");
    }

    res.json(order);
  }),
);

router.patch(
  "/orders/:orderId/status",
  asyncHandler(async (req, res) => {
    const { orderId } = UpdateOrderStatusParams.parse(req.params);
    const body = UpdateOrderStatusBody.parse(req.body);
    const id = parseUuid(orderId, "orderId");
    const actorId = parseUuid(body.actorId, "actorId");

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1);
    if (!order) {
      throw new MarketplaceError(404, "Order not found");
    }

    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, order.listingId))
      .limit(1);
    if (!listing) {
      throw new MarketplaceError(404, "Listing not found");
    }

    const actor = await getUserOrThrow(actorId, "actorId");
    const sellerStatuses = new Set(["confirmed", "ready"]);
    const validNextStatus: Record<string, string> = {
      placed: "confirmed",
      confirmed: "ready",
      ready: "completed",
    };
    if (validNextStatus[order.status] !== body.status) {
      throw new MarketplaceError(
        409,
        `Order can only move from ${order.status} to ${validNextStatus[order.status] ?? "no further status"}`,
      );
    }

    const isSeller = actor.id === listing.sellerId;
    const isBuyer = actor.id === order.buyerId;
    if (!isSeller && !isBuyer) {
      throw new MarketplaceError(403, "You are not a buyer or seller on this order");
    }
    if (sellerStatuses.has(body.status) && !isSeller) {
      throw new MarketplaceError(
        403,
        "Only the listing farmer or FPO can confirm or ready an order",
      );
    }

    const [updatedOrder] = await db
      .update(ordersTable)
      .set({ status: body.status })
      .where(eq(ordersTable.id, order.id))
      .returning();

    res.json(updatedOrder);
  }),
);

export default router;