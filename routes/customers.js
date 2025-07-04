import express from "express";
import { shopifyRequest } from "../utils/shopify.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest("customers.json");
    if (!ok) return res.status(status).json({ error: "Failed to fetch customers from Shopify" });
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/create", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest("customers.json", "POST", {
      customer: req.body,
    });

    if (!ok) {
      let errorMsg = { error: "Failed to create customer" };
      try {
        const json = JSON.parse(data);
        if (json.errors) {
          const [field, messages] = Object.entries(json.errors)[0];
          errorMsg = { error: `${field} ${messages[0]}` };
        }
      } catch {
        errorMsg.details = data;
      }
      return res.status(status).json(errorMsg);
    }

    const customer = JSON.parse(data).customer;
    return addCustomerMetafields(res, customer);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Metafields helper
const addCustomerMetafields = async (res, customer) => {
  const { id, first_name, last_name, email, phone, addresses } = customer;
  const address = addresses?.[0]?.address1;

  if (!id || !first_name || !last_name || !email || !address) {
    return res.status(400).json({ error: "Missing required customer data." });
  }

  const metafields = [
    {
      key: "name",
      value: `${first_name} ${last_name}`,
      type: "single_line_text_field",
    },
    { key: "phone_no", value: phone || "", type: "single_line_text_field" },
    { key: "email", value: email, type: "single_line_text_field" },
    { key: "address", value: address, type: "multi_line_text_field" },
  ].map((m) => ({ namespace: "custom", ...m }));

  const created = [];

  for (const metafield of metafields) {
    const { ok, data } = await shopifyRequest(`customers/${id}/metafields.json`, "POST", {
      metafield,
    });
    const result = JSON.parse(data);
    if (ok && result.metafield) {
      created.push(result.metafield);
    }
  }

  if (!created.length) {
    return res.status(500).json({ error: "No metafields were created." });
  }

  return res.status(200).json({ message: "Metafields added successfully.", created });
};

export default router;
