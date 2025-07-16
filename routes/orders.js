import express from "express";
import { shopifyRequest } from "../utils/shopify.js";

const router = express.Router();

router.get("/all/:customerEmail", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest(`orders.json?email=${req.params.customerEmail}`);
    if (!ok) return res.status(status).json({ error: "Failed to fetch orders from Shopify" });
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// router.get("/getplan/:customerEmail", async (req, res) => {
//   try {
//     const { ok, status, data } = await shopifyRequest(`orders.json?email=${req.params.customerEmail}`);
//     if (!ok) return res.status(status).json({ error: "Failed to fetch orders from Shopify" });

// const orders = JSON.parse(data).orders;
// const simplifiedOrders = orders.map((order) => {
//   const lineItem = order.line_items[0];
//   const createdDate = new Date(order.created_at);
//   const dateOnly = createdDate.toISOString().split("T")[0];

//   // Add exactly 30 days
//   const nextMonthDate = new Date(createdDate);
//   // nextMonthDate.setMonth(createdDate.getMonth() + 1);
//   nextMonthDate.setDate(createdDate.getDate() + 30);
//   const nextMonthDateOnly = nextMonthDate.toISOString().split("T")[0];

//   const today = new Date(); // Replace with fixed date for testing if needed
//   const daysLeft = Math.ceil((nextMonthDate - today) / (1000 * 60 * 60 * 24));


//       return {
//         orderId: order.id,
//         orderNumber: order.name,
//         date: dateOnly,
//         nextMonthDate: nextMonthDateOnly,
//         daysLeft,
//         financialStatus: order.financial_status,
//         totalPrice: order.total_price,
//         currency: order.currency,
//         paymentGateway: order.payment_gateway_names[0],
//         customerName: `${order.customer.first_name} ${order.customer.last_name}`,
//         customerEmail: order.customer.email,
//         productTitle: lineItem?.title,
//         variantTitle: lineItem?.variant_title,
//         quantity: lineItem?.quantity,
//         orderStatusUrl: order.order_status_url,
//       };
//     });

//     res.json(simplifiedOrders);
//   } catch (error) {
//     console.error("Error fetching orders:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });
router.get("/getplan/:customerEmail", async (req, res) => {
  try {
    const { ok, status, data } = await shopifyRequest(`orders.json?email=${req.params.customerEmail}`);
    if (!ok) return res.status(status).json({ error: "Failed to fetch orders from Shopify" });

    const orders = JSON.parse(data).orders;
    if (!orders.length) return res.json({ message: "No orders found" });

    // Sort by most recent order
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const order = orders[0]; // Get the most recent order
    const lineItem = order.line_items[0];
    const createdDate = new Date(order.created_at);
    const dateOnly = createdDate.toISOString().split("T")[0];

    const nextMonthDate = new Date(createdDate);
    nextMonthDate.setDate(createdDate.getDate() + 30);
    const nextMonthDateOnly = nextMonthDate.toISOString().split("T")[0];

    const today = new Date();
    const daysLeft = Math.ceil((nextMonthDate - today) / (1000 * 60 * 60 * 24));

    const simplifiedOrder = {
      orderId: order.id,
      orderNumber: order.name,
      date: dateOnly,
      nextMonthDate: nextMonthDateOnly,
      daysLeft,
      financialStatus: order.financial_status,
      totalPrice: order.total_price,
      currency: order.currency,
      paymentGateway: order.payment_gateway_names[0],
      customerName: `${order.customer.first_name} ${order.customer.last_name}`,
      customerEmail: order.customer.email,
      productTitle: lineItem?.title,
      variantTitle: lineItem?.variant_title,
      quantity: lineItem?.quantity,
      orderStatusUrl: order.order_status_url,
    };

    res.json(simplifiedOrder);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
