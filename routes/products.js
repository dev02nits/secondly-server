import express from "express";
import { shopifyRequest } from "../utils/shopify.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest("products.json");
    if (!ok) return res.status(status).json({ error: "Failed to fetch products from Shopify" });
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
