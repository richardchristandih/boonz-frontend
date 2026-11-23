import express from "npm:express@4.22.3";
const router = express.Router();
import { Order } from "../repositories.js";

// Utility to check if date is "today"
function isToday(date) {
  const now = new Date();
  return (
    date.getUTCDate() === now.getUTCDate() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCFullYear() === now.getUTCFullYear()
  );
}

router.get("/", async (req, res) => {
  try {
    const orders = await Order.list({ includeVoids: false });

    // 2) Compute "today's" sales, "this month," "this year," plus total orders, average order, etc.
    let todaySales = 0;
    let monthSales = 0;
    let yearSales = 0;
    let totalRevenue = 0;

    const now = new Date();
    const currentMonth = now.getUTCMonth();
    const currentYear = now.getUTCFullYear();

    orders.forEach((order) => {
      const createdAt = new Date(order.createdAt);
      const orderTotal = order.totalAmount || 0;

      // For daily sales
      if (isToday(createdAt)) {
        todaySales += orderTotal;
      }
      // For monthly sales
      if (
        createdAt.getUTCMonth() === currentMonth &&
        createdAt.getUTCFullYear() === currentYear
      ) {
        monthSales += orderTotal;
      }
      // For yearly sales
      if (createdAt.getUTCFullYear() === currentYear) {
        yearSales += orderTotal;
      }

      // Keep track of overall revenue for average order calculations
      totalRevenue += orderTotal;
    });

    const orderCount = orders.length;
    const averageOrder = orderCount > 0 ? totalRevenue / orderCount : 0;

    // 3) Compute product-level stats (quantity sold, total sales per product)
    // We can group by product ID or product name:
    const productSalesMap = {};
    // { productId: { name, quantity, total } }

    orders.forEach((order) => {
      if (order.products && order.products.length > 0) {
        order.products.forEach((prod) => {
          const pId = String(prod.productId || prod.name); // or just use name if easier
          if (!productSalesMap[pId]) {
            productSalesMap[pId] = {
              name: prod.name,
              quantity: 0,
              total: 0,
            };
          }
          productSalesMap[pId].quantity += prod.quantity;
          productSalesMap[pId].total += prod.price * prod.quantity;
        });
      }
    });

    // Convert map to array
    const productSales = Object.entries(productSalesMap).map(
      ([productId, data]) => ({
        productId,
        name: data.name,
        quantity: data.quantity,
        total: data.total,
      })
    );

    // 4) Respond with all aggregated dashboard data
    res.json({
      totalSales: {
        day: todaySales,
        month: monthSales,
        year: yearSales,
      },
      orderCount,
      averageOrder,
      productSales,
    });
  } catch (error) {
    console.error("Error in /api/dashboard:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

export default router;
