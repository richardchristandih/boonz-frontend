// controllers/orderController.js
import { Order } from "../repositories.js";
import { Setting } from "../repositories.js"; // 👈 NEW: pull order-charges from DB
import { sendMail } from "../services/mailer.js";
import { renderReceiptEmail } from "../services/templates/receiptEmail.js";

const DEFAULT_REPLY_TO = Deno.env.get("MAIL_REPLY_TO") || "";

/* ------------------------- helpers ------------------------- */
const clampNote = (v) => {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.length > 200 ? s.slice(0, 200) : s;
};

function normalizeProducts(input = []) {
  if (!Array.isArray(input)) return [];
  return input.map((p) => ({
    productId: p?.productId,
    name: (p?.name || "").toString().trim(),
    quantity: Number(p?.quantity || 0),
    price: Number(p?.price || 0),
    note: clampNote(p?.note),
  }));
}

/** Load order-charge settings once per request */
async function getOrderCharges() {
  const d = await Setting.get("order-charges") || {};
  return {
    taxEnabled: !!d.taxEnabled,
    taxRate: Number(d.taxRate) || 0, // decimal (0.10 = 10%)
    serviceEnabled: !!d.serviceEnabled,
    serviceRate: Number(d.serviceRate) || 0, // decimal
  };
}

/* ------------------------- CREATE ORDER ------------------------- */
export const createOrder = async (req, res, next) => {
  try {
    const {
      products,

      // client may still send these but we will recompute
      // subtotal, tax, serviceCharge, totalAmount,

      // discount from promo or custom
      discount,
      discountNote,

      orderType,
      paymentMethod,

      // email (optional)
      customerEmail,
      customerName,
      sendEmail = false,
      logoUrl,

      // promotion (optional)
      promotion,
      promoId,
    } = req.body;

    // normalize line items
    const sanitizedProducts = normalizeProducts(products);

    // recompute subtotal on server
    const subtotal = sanitizedProducts.reduce(
      (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0),
      0
    );

    // fetch current tax/service settings from DB
    const charges = await getOrderCharges();
    const tax = charges.taxEnabled ? subtotal * charges.taxRate : 0;
    const serviceCharge = charges.serviceEnabled
      ? subtotal * charges.serviceRate
      : 0;

    // clamp discount (never below 0, never exceed subtotal+tax+service)
    const discountNum = Math.max(0, Number(discount || 0));
    const maxDiscount = subtotal + tax + serviceCharge;
    const finalDiscount = Math.min(discountNum, maxDiscount);

    // final total (never negative)
    const totalAmount = Math.max(
      0,
      subtotal + tax + serviceCharge - finalDiscount
    );

    if (!["Credit Card", "Debit Card", "QRIS", "Go Pay", "Grab Pay"].includes(paymentMethod) ||
        !["Delivery", "Dine in", "Take away"].includes(orderType ?? "Delivery") ||
        !Number.isFinite(totalAmount) || !req.user.userId ||
        sanitizedProducts.some((item) => !/^[a-f0-9]{24}$/.test(item.productId) || !item.name ||
          !Number.isFinite(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price < 0)) {
      return res.status(400).json({ message: "Invalid order details." });
    }

    const saved = await Order.create({
      status: "pending",
      products: sanitizedProducts,
      subtotal,
      tax,
      serviceCharge,
      discount: finalDiscount,
      discountNote: (discountNote || "None").toString().trim().slice(0, 140) || "None",
      totalAmount,

      user: req.user.userId,
      orderType: orderType ?? "Delivery",
      paymentMethod,

      promotion: promotion || promoId || null,

      customerEmail: typeof customerEmail === "string" ? customerEmail.trim() || undefined : undefined,
      customerName: typeof customerName === "string" ? customerName.trim() || undefined : undefined,
    });

    // build once for emails
    const html = renderReceiptEmail(saved, { logoUrl });

    // owner email (fire and forget)
    if (Deno.env.get("ADMIN_EMAIL")) {
      const ownerEmail = sendMail({
        to: Deno.env.get("ADMIN_EMAIL"),
        subject: `New Order • #${saved.orderNumber}`,
        html,
        text: `Total: Rp.${Number(saved.totalAmount || 0).toFixed(2)}`,
        replyTo: DEFAULT_REPLY_TO,
      }).catch((e) => console.error("[orders] owner email failed:", e));
      if (globalThis.EdgeRuntime) globalThis.EdgeRuntime.waitUntil(ownerEmail);
      else await ownerEmail;
    }

    // optional customer email
    let emailSent = false;
    if (sendEmail && saved.customerEmail) {
      try {
        await sendMail({
          to: saved.customerEmail,
          subject: `Receipt • Order #${saved.orderNumber}`,
          html,
          text: `Total: Rp.${Number(saved.totalAmount || 0).toFixed(2)}`,
          replyTo: DEFAULT_REPLY_TO,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error("[orders] customer email failed:", mailErr);
      }
    }

    res.status(201).json({ ...saved, emailSent });
  } catch (err) {
    next(err);
  }
};

/* ------------------------- LIST ORDERS ------------------------- */
/**
 * For this POS, non-admin *can* see all orders (frontend hides revenue).
 * If you ever want to scope to the creator, change `query` accordingly.
 */
export const getOrders = async (_req, res, next) => {
  try {
    const orders = await Order.list({ populate: true });
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

/* ------------------------- UPDATE STATUS ------------------------- */
/**
 * Rules:
 * - Allowed transitions:
 *    pending -> done | cancelled
 *    done    -> refunded
 * - Role guard:
 *    admin: may set to "pending" | "done" | "cancelled" | "refunded"
 *    user : may set ONLY to "done"
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const status = String(req.body.status || "").toLowerCase();
    const isAdmin = ["admin", "superadmin"].includes(req.user?.role);

    if (!["pending", "done", "cancelled", "refunded"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    // role guard
    if (!isAdmin && status !== "done") {
      return res
        .status(403)
        .json({ message: "Only admins can cancel or refund orders." });
    }

    const order = await Order.get(id);
    if (!order) return res.status(404).json({ message: "Order not found." });

    const current = String(order.status || "pending").toLowerCase();

    // transition guard
    if (status === "cancelled" && current !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending orders can be cancelled." });
    }
    if (status === "done" && current !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending orders can be marked as done." });
    }
    if (status === "refunded" && current !== "done") {
      return res
        .status(400)
        .json({ message: "Only done orders can be refunded." });
    }

    const updated = await Order.updateStatus(id, current, status);
    if (!updated) return res.status(409).json({ message: "Order status changed. Refresh and try again." });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/* ------------------------- SEND/RESEND RECEIPT ------------------------- */
export const sendEmailReceipt = async (req, res, next) => {
  try {
    const { orderId } = req.params; // may be orderNumber or _id
    const { to, logoUrl } = req.body || {};
    if (!to) return res.status(400).json({ message: "Missing 'to' email." });

    const order = /^[a-f0-9]{24}$/.test(orderId)
      ? await Order.get(orderId)
      : await Order.byNumber(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    const html = renderReceiptEmail(order, { logoUrl });

    await sendMail({
      to,
      subject: `Receipt • Order #${order.orderNumber || order._id}`,
      html,
      text: `Total: Rp.${Number(order.totalAmount || 0).toFixed(2)}`,
      replyTo: DEFAULT_REPLY_TO,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
