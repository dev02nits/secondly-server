import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import customerRoutes from "./routes/customers.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import wishlistRoutes from "./routes/wishlist.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

app.use("/accounts", customerRoutes);
app.use("/products", productRoutes);
app.use("/order", orderRoutes);
app.use("/wishlist", wishlistRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
