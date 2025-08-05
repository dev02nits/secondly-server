import express from "express";
import { shopifyRequest } from "../utils/shopify.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest("products.json");
    if (!ok)
      return res
        .status(status)
        .json({ error: "Failed to fetch products from Shopify" });
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
        .map((item) => item?.children?.[0]?.value || "")
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  };

  try {
    // Fetch metafields
    const metafieldsResponse = await shopifyRequest(
      `products/${productId}/metafields.json`
    );
    if (!metafieldsResponse.ok) {
      return res
        .status(metafieldsResponse.status)
        .json({ error: "Failed to fetch metafields from Shopify" });
    }

    const metafields = JSON.parse(metafieldsResponse.data).metafields;

    // Prepare a map of required metafields
    const requiredKeys = [
      "quantity_3_details",
      "quantity_6_details",
      "quantity_9_details",
    ];
    const metafieldMap = {};

    metafields.forEach((mf) => {
      if (requiredKeys.includes(mf.key)) {
        metafieldMap[mf.key] = extractListItems(mf.value);
      }
    });

    // Fetch product and variants
    const productResponse = await shopifyRequest(`products/${productId}.json`);
    if (!productResponse.ok) {
      return res
        .status(productResponse.status)
        .json({ error: "Failed to fetch product details" });
    }

    const product = JSON.parse(productResponse.data).product;
    const variants = product.variants.map((v) => ({
      title: v.title,
      price: v.price,
    }));

    // Build result by matching variant title number to metafield key
    const result = variants.map((variant) => {
      const quantityMatch = variant.title.match(/\d+/); // extract number from title
      const quantity = quantityMatch ? quantityMatch[0] : null;
      const metafieldKey = quantity ? `quantity_${quantity}_details` : null;

      return {
        variantTitle: variant.title,
        variantPrice: variant.price,
        metafieldKey,
        metafieldItems:
          metafieldKey && metafieldMap[metafieldKey]
            ? metafieldMap[metafieldKey]
            : [],
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
