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

router.put("/update-name-by-email", async (req, res) => {
  try {
    const { email, first_name, last_name } = req.body;
    console.log(req.body)
    if (!email || !first_name || !last_name) {
      return res.status(400).json({
        error: "Missing required fields: email, first_name, last_name",
      });
    }

    // Step 1: Find customer by email
    const { ok: findOk, data: findData } = await shopifyRequest(
      `customers/search.json?query=email:${encodeURIComponent(email)}`,
      "GET"
    );

    if (!findOk) {
      return res.status(404).json({ error: "Failed to search for customer" });
    }

    const customers = JSON.parse(findData).customers;

    if (!customers.length) {
      return res.status(404).json({ error: "Customer not found with provided email" });
    }

    const customer = customers[0];
    const customerId = customer.id;

    // Step 2: Update customer name
    const updatePayload = {
      customer: {
        id: customerId,
        first_name,
        last_name,
      },
    };

    const { ok: updateOk, status, data } = await shopifyRequest(
      `customers/${customerId}.json`,
      "PUT",
      updatePayload
    );

    if (!updateOk) {
      let errorMsg = { error: "Failed to update customer name" };
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

    const updatedCustomer = JSON.parse(data).customer;

    // Step 3: Save full name in metafield
    const metafieldPayload = {
      metafield: {
        namespace: "custom",
        key: "name",
        value: `${first_name} ${last_name}`,
        type: "single_line_text_field",
      },
    };

    const { ok: metaOk, data: metaData } = await shopifyRequest(
      `customers/${customerId}/metafields.json`,
      "POST",
      metafieldPayload
    );

    if (!metaOk) {
      return res.status(200).json({
        message: "Name updated, but metafield creation failed.",
        customer: updatedCustomer,
        metafieldError: JSON.parse(metaData),
      });
    }

    const createdMetafield = JSON.parse(metaData).metafield;

    return res.status(200).json({
      message: "Customer name and metafield updated successfully.",
      customer: updatedCustomer,
      metafield: createdMetafield,
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



export default router;
