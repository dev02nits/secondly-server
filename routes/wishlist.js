import express from "express";
import { shopifyRequest } from "../utils/shopify.js"; // make sure this path is correct

const router = express.Router();

router.get("/get", async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;

    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    const wishlist = wishlistMeta ? JSON.parse(wishlistMeta.value) : {};
    res.json({ wishlist: wishlist["all"] || [] });
  } catch (err) {
    console.error("Wishlist GET error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/remove", async (req, res) => {
  const { email, productTitle, variantId } = req.body;
  if (!email || (!productTitle && !variantId)) {
    return res
      .status(400)
      .json({ error: "Missing email and product identifier" });
  }

  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    if (!wishlistMeta)
      return res.status(404).json({ error: "Wishlist not found" });

    let wishlist = JSON.parse(wishlistMeta.value);

    const filterFn = (p) =>
      variantId
        ? p.variantId !== variantId
        : p.productTitle.replace(/'/g, "") !== productTitle.replace(/'/g, "");

    for (let bucket in wishlist) {
      wishlist[bucket] = wishlist[bucket].filter(filterFn);
    }
    const orderedWishlist = {
      all: wishlist["all"],
      ...Object.keys(wishlist)
        .filter((key) => key !== "all")
        .reduce((acc, key) => {
          acc[key] = wishlist[key];
          return acc;
        }, {}),
    };

    const payload = {
      metafield: {
        namespace: "custom",
        key: "wishlist",
        type: "json",
        value: JSON.stringify(orderedWishlist),
      },
    };

    const saveRes = await shopifyRequest(
      `customers/${customerId}/metafields/${wishlistMeta.id}.json`,
      "PUT",
      payload
    );
    if (!saveRes.ok) throw new Error("Failed to update wishlist");

    res.json({
      success: true,
      message: "Item removed",
      wishlist: wishlist["all"] || [],
    });
  } catch (err) {
    console.error("Wishlist REMOVE error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/toggle", async (req, res) => {
  const { email, bucket, newItem } = req.body;
  if (!email || !bucket || !newItem)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    let wishlist = wishlistMeta ? JSON.parse(wishlistMeta.value) : {};
    if (!wishlist[bucket]) wishlist[bucket] = [];
    if (!wishlist["all"]) wishlist["all"] = [];

    const exists = wishlist[bucket].some(
      (p) => p.variantId === newItem.variantId
    );

    if (exists) {
      wishlist[bucket] = wishlist[bucket].filter(
        (p) => p.variantId !== newItem.variantId
      );
      wishlist["all"] = wishlist["all"].filter(
        (p) => p.variantId !== newItem.variantId
      );
    } else {
      wishlist[bucket].push(newItem);
      wishlist["all"].push(newItem);
    }

    const orderedWishlist = {
      all: wishlist["all"],
      ...Object.keys(wishlist)
        .filter((key) => key !== "all")
        .reduce((acc, key) => {
          acc[key] = wishlist[key];
          return acc;
        }, {}),
    };

    const payload = {
      metafield: {
        namespace: "custom",
        key: "wishlist",
        type: "json",
        value: JSON.stringify(orderedWishlist),
      },
    };

    const method = wishlistMeta ? "PUT" : "POST";
    const url = wishlistMeta
      ? `customers/${customerId}/metafields/${wishlistMeta.id}.json`
      : `customers/${customerId}/metafields.json`;

    const saveRes = await shopifyRequest(url, method, payload);
    if (!saveRes.ok) throw new Error("Failed to update wishlist");

    res.json({
      success: true,
      isWished: !exists,
      message: exists ? "Item removed from wishlist" : "Item added to wishlist",
      wishlist: wishlist["all"],
    });
  } catch (err) {
    console.error("Wishlist TOGGLE error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/add", async (req, res) => {
  const { email, bucket, newItem } = req.body;

  if (!email || !bucket || !newItem) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    let wishlist = wishlistMeta ? JSON.parse(wishlistMeta.value) : {};
    if (!wishlist[bucket]) wishlist[bucket] = [];
    if (!wishlist["all"]) wishlist["all"] = [];

    const alreadyExists = wishlist[bucket].some(
      (p) => p.variantId === newItem.variantId
    );

    if (alreadyExists) {
      return res.json({
        success: true,
        isWished: true,
        message: "Item already in wishlist",
        wishlist: wishlist["all"],
      });
    }

    // Add to both specified bucket and "all"
    wishlist[bucket].push(newItem);
    wishlist["all"].push(newItem);

    const payload = {
      metafield: {
        namespace: "custom",
        key: "wishlist",
        type: "json",
        value: JSON.stringify(wishlist),
      },
    };

    const method = wishlistMeta ? "PUT" : "POST";
    const url = wishlistMeta
      ? `customers/${customerId}/metafields/${wishlistMeta.id}.json`
      : `customers/${customerId}/metafields.json`;

    const saveRes = await shopifyRequest(url, method, payload);
    if (!saveRes.ok) throw new Error("Failed to update wishlist");

    res.json({
      success: true,
      isWished: true,
      message: "Item added to wishlist",
      wishlist: wishlist["all"],
    });
  } catch (err) {
    console.error("Wishlist ADD error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
