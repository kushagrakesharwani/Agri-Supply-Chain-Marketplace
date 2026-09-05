import { Router, type IRouter } from "express";
import { RequestStorageUploadUrlBody, RequestStorageUploadUrlResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  try {
    const body = RequestStorageUploadUrlBody.parse(req.body);
    const [seller] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, body.sellerId))
      .limit(1);

    if (!seller) {
      res.status(404).json({ error: "Seller not found" });
      return;
    }
    if (seller.role !== "farmer" && seller.role !== "fpo") {
      res.status(400).json({ error: "Only farmers and FPOs can upload listing photos" });
      return;
    }

    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    res.json(RequestStorageUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      res.status(400).json({ error: "Missing or invalid upload metadata" });
      return;
    }
    req.log.error({ err: error }, "Listing photo upload URL failed");
    res.status(500).json({ error: "Could not prepare the photo upload" });
  }
});

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  try {
    const rawPath = req.params.path;
    const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = (await import("node:stream")).Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
      return;
    }
    res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Listing photo serving failed");
    res.status(500).json({ error: "Could not serve the listing photo" });
  }
});

export default router;