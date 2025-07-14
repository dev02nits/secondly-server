import express from "express";
import { shopifyRequest } from "../utils/shopify.js"; // make sure this path is correct

const router = express.Router();

router.get("/get", async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    // Search for customer
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;

    if (!customers.length)
      return res.status(404).json({ error: "Customer not found" });

    const customerId = customers[0].id;

    // Get customer's metafields
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;

    // Find wishlist metafield
    let wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    let wishlist = { all: [] }; // Default structure

    if (wishlistMeta && wishlistMeta.value) {
      try {
        const parsed = JSON.parse(wishlistMeta.value);
        if (typeof parsed === "object" && Array.isArray(parsed.all)) {
          wishlist = parsed;
        }
      } catch (err) {
        console.warn("Invalid JSON in wishlist metafield, using default.");
      }
    } else {
      // If wishlist metafield does not exist, create it
      const createRes = await shopifyRequest(
        `metafields.json`,
        "POST",
        {
          metafield: {
            namespace: "custom",
            key: "wishlist",
            value: JSON.stringify(wishlist),
            type: "json",
            owner_id: customerId,
            owner_resource: "customer"
          }
        }
      );

      // Optional: update local variable with newly created metafield
      wishlistMeta = JSON.parse(createRes.data).metafield;
    }

    res.json({ wishlist });
  } catch (err) {
    console.error("Wishlist GET error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.post("/remove", async (req, res) => {
  const { email, productTitle, bucket } = req.body;

  if (!email || !productTitle || !bucket) {
    return res.status(400).json({ error: "Missing email or product info" });
  }
  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerId = customers[0].id;
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    if (!wishlistMeta) {
      return res.status(404).json({ error: "Wishlist not found" });
    }
    let wishlist = JSON.parse(wishlistMeta.value);

    const normalizedTitle = productTitle.replace(/'/g, "").toLowerCase();
    const matchFn = (p) =>
      p.productTitle?.replace(/'/g, "").toLowerCase() === normalizedTitle;

    if (bucket === "all") {
      // Remove from ALL buckets
      for (let b in wishlist) {
        wishlist[b] = wishlist[b].filter((p) => !matchFn(p));
      }
    } else {
      // Check if the product exists in any other bucket (excluding 'all' and current)
      const existsInOtherBucket = Object.entries(wishlist).some(
        ([key, items]) =>
          key !== "all" &&
          key !== bucket &&
          Array.isArray(items) &&
          items.some(matchFn)
      );

      // Remove from the current bucket
      if (wishlist[bucket]) {
        wishlist[bucket] = wishlist[bucket].filter((p) => !matchFn(p));
      }

      // Also remove from 'all' if it doesn't exist in other buckets
      if (!existsInOtherBucket && wishlist["all"]) {
        wishlist["all"] = wishlist["all"].filter((p) => !matchFn(p));
      }
    }

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

    if (!saveRes.ok) {
      throw new Error("Failed to update wishlist");
    }

    res.json({
      success: true,
      message: "Item removed",
      wishlist: orderedWishlist["all"] || [],
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
  (p) => p.productTitle === newItem.productTitle
);

if (exists) {
  wishlist[bucketKey] = wishlist[bucketKey].filter(
    (p) => p.productTitle !== newItem.productTitle
  );
  wishlist["all"] = wishlist["all"].filter(
    (p) => p.productTitle !== newItem.productTitle
  );
} else {
  if (bucketKey !== "all") {
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

    // 🔄 Check by productTitle instead of variantId
    const alreadyExists = wishlist[bucket].some(
      (p) => p.productTitle === newItem.productTitle
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
    if (bucket !== "all") {
      wishlist[bucket].push(newItem);
    }
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


router.post("/replace-bucket", async (req, res) => {
  const { email, bucket, productTitles } = req.body;

  if (!email || !bucket || !Array.isArray(productTitles)) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    const searchRes = await shopifyRequest(
      `customers/search.json?query=email:${email}`,
      "GET"
    );
    const customers = JSON.parse(searchRes.data).customers;
    if (!customers.length) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerId = customers[0].id;
    const metaRes = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "GET"
    );
    const metas = JSON.parse(metaRes.data).metafields;
    const wishlistMeta = metas.find(
      (m) => m.namespace === "custom" && m.key === "wishlist"
    );

    if (!wishlistMeta) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    let wishlist = JSON.parse(wishlistMeta.value);
    const normalize = (str) => str.replace(/'/g, "").toLowerCase();

    // Build a lookup map of all wishlist products from all buckets
    const allProductsMap = {};
    for (const [bKey, items] of Object.entries(wishlist)) {
      for (const item of items) {
        const key = normalize(item.productTitle);
        if (!allProductsMap[key]) {
          allProductsMap[key] = item;
        }
      }
    }

    // Construct new bucket list based on given titles
const newBucketProducts = [];
for (const title of productTitles) {
  const key = normalize(title);
  if (allProductsMap[key]) {
    newBucketProducts.push({ ...allProductsMap[key] });
  } else {
    console.warn(`Product "${title}" not found in any bucket.`);
  }
}

if (bucket === "all") {
  // Replace 'all' bucket exactly
  wishlist["all"] = newBucketProducts;

  // Build set of new 'all' product titles
  const newAllTitlesSet = new Set(productTitles.map(t => normalize(t)));

  // Remove from other buckets products not in 'all'
  for (const key of Object.keys(wishlist)) {
    if (key === "all") continue;
    wishlist[key] = wishlist[key].filter(
      (item) => newAllTitlesSet.has(normalize(item.productTitle))
    );
  }
} else {
  // Replace only the specified bucket
  wishlist[bucket] = newBucketProducts;
}

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

    if (!saveRes.ok) {
      throw new Error("Failed to update wishlist");
    }

    res.json({
      success: true,
      message: `Bucket '${bucket}' replaced successfully`,
      wishlist: wishlist[bucket],
    });
  } catch (err) {
    console.error("Wishlist REPLACE BUCKET error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



export default router;

