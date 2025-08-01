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


router.get("/metafields/:productId", async (req, res) => {
  const { productId } = req.params;

  const extractListItems = (richTextJsonStr) => {
    try {
      const parsed = JSON.parse(richTextJsonStr);
      const list = parsed?.children?.[0]?.children || [];
      return list
        .map(item => item?.children?.[0]?.value || "")
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  };

  try {
    // Fetch metafields
    const metafieldsResponse = await shopifyRequest(`products/${productId}/metafields.json`);
    if (!metafieldsResponse.ok) {
      return res.status(metafieldsResponse.status).json({ error: "Failed to fetch metafields from Shopify" });
    }

    const metafields = JSON.parse(metafieldsResponse.data).metafields;

    // Filter required metafields
    const requiredKeys = ["quantity_9_details", "quantity_6_details", "quantity_3_details"];
    const filteredMetafields = metafields
      .filter(mf => requiredKeys.includes(mf.key))
      .map(mf => ({
        key: mf.key,
        items: extractListItems(mf.value)
      }));

    // Fetch product and variants
    const productResponse = await shopifyRequest(`products/${productId}.json`);
    if (!productResponse.ok) {
      return res.status(productResponse.status).json({ error: "Failed to fetch product details" });
    }

    const product = JSON.parse(productResponse.data).product;
    const variants = product.variants.map(v => ({
      title: v.title,
      price: v.price
    }));

    // Merge variant and metafield data by index
    const result = [];
    const count = Math.min(variants.length, filteredMetafields.length);

    for (let i = 0; i < count; i++) {
      result.push({
        variantTitle: variants[i].title,
        variantPrice: variants[i].price,
        metafieldKey: filteredMetafields[i].key,
        metafieldItems: filteredMetafields[i].items
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});





export default router;
