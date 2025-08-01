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

// ...existing code...

router.get("/metafields/:productId", async (req, res) => {
  const { productId } = req.params;

  // Helper to extract list items from a rich text JSON string
  const extractListItems = (richTextJsonStr) => {
    try {
      const parsed = JSON.parse(richTextJsonStr);
      const list = parsed?.children?.[0]?.children || [];
      return list
        .map(item => item?.children?.[0]?.value || "")
        .filter(Boolean);
    } catch (e) {
      return []; // Return empty if parsing fails
    }
  };

  try {
    // Fetch all metafields for the product
    const { ok, status, data } = await shopifyRequest(`products/${productId}/metafields.json`);
    if (!ok) {
      return res.status(status).json({ error: "Failed to fetch metafields from Shopify" });
    }

    const metafields = JSON.parse(data).metafields;

    // Keys you're interested in
    const requiredKeys = [
      "quantity_9_details",
      "quantity_6_details",
      "quantity_3_details"
    ];

    // Filter and transform
    const filtered = metafields
      .filter(mf => requiredKeys.includes(mf.key))
      .map(mf => ({
        key: mf.key,
        items: extractListItems(mf.value), // parsed and flattened list items
        type: mf.type
      }));

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});



export default router;
