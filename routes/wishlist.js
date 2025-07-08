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
    res.json({ wishlist: wishlist || [] });
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

  const bucketKey = bucket.toLowerCase(); // 🔑 Normalize bucket to lowercase

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

    // 🔁 Normalize any existing keys to lowercase
    wishlist = Object.keys(wishlist).reduce((acc, key) => {
      acc[key.toLowerCase()] = wishlist[key];
      return acc;
    }, {});

    if (!wishlist[bucketKey]) wishlist[bucketKey] = [];
    if (!wishlist["all"]) wishlist["all"] = [];

    const exists = wishlist[bucketKey].some(
      (p) => p.variantId === newItem.variantId
    );

    if (exists) {
      wishlist[bucketKey] = wishlist[bucketKey].filter(
        (p) => p.variantId !== newItem.variantId
      );
      wishlist["all"] = wishlist["all"].filter(
        (p) => p.variantId !== newItem.variantId
      );
    } else {
      if(bucketKey!="all"){
        wishlist[bucketKey].push(newItem);
      }
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

router.post("/create-bucket", async (req, res) => {
  const { email, bucket } = req.body;

  if (!email || !bucket) {
    return res.status(400).json({ error: "Email and bucket name are required." });
  }

  const bucketKey = bucket.toLowerCase();

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
    wishlist = Object.keys(wishlist).reduce((acc, key) => {
      acc[key.toLowerCase()] = wishlist[key];
      return acc;
    }, {});

    // Create the new bucket if it doesn't exist
    if (!wishlist[bucketKey]) {
      wishlist[bucketKey] = [];
    }

    // Make sure "all" always exists
    if (!wishlist["all"]) {
      wishlist["all"] = [];
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
    if (!saveRes.ok) throw new Error("Failed to create bucket");

    res.json({
      success: true,
      message: `Bucket '${bucketKey}' created successfully.`,
      wishlist: orderedWishlist,
    });
  } catch (err) {
    console.error("Create Bucket Error:", err);
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

router.post("/remove-bucket", async (req, res) => {
  const { email, bucket } = req.body;

  if (!email || !bucket) {
    return res.status(400).json({ error: "Email and bucket name are required." });
  }

  const bucketKey = bucket.toLowerCase();

  try {
    // 1. Find customer by email
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;

    // 2. Fetch metafields
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

    // Normalize all keys to lowercase
    wishlist = Object.keys(wishlist).reduce((acc, key) => {
      acc[key.toLowerCase()] = wishlist[key];
      return acc;
    }, {});

    // 3. Remove the bucket
    if (!wishlist[bucketKey]) {
      return res.status(404).json({ error: `Bucket '${bucketKey}' not found.` });
    }
    delete wishlist[bucketKey];

    // 4. Ensure "all" remains at top and update metafield
    const orderedWishlist = {
      all: wishlist["all"] || [],
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
      message: `Bucket '${bucketKey}' removed successfully.`,
      wishlist: orderedWishlist,
    });
  } catch (err) {
    console.error("Remove Bucket Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



export default router;
