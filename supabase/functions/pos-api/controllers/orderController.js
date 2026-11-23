// controllers/orderController.js
import { Order, Setting } from "../repositories.js";
import { transaction } from "../database.js";
import {
  hasMembershipAccess, normalizeEmail, prepareMemberOrder, recordMemberPoints, requestError,
  uuidPattern, validateMemberPrices, withoutMembershipDetails,
} from "../membership.js";
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

function receiptText(order) {
  const total = `Total: Rp.${Number(order.totalAmount || 0).toFixed(2)}`;
  const membership = order.membership;
  if (!membership) return total;
  const reversed = ["cancelled", "refunded"].includes(order.status)
    ? `
This order was ${order.status} and its points were reversed.` : "";
  return [
    total,
    `Boonz points earned: ${membership.earned}`,
    `Points redeemed: ${membership.redeemed}`,
    `Points balance after checkout: ${membership.balance}${reversed}`,
  ].join("\n");
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
      memberId,
      rewardProductId,
      rewardPoints,
      checkoutId: suppliedCheckoutId,
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

    const checkoutId = typeof suppliedCheckoutId === "string" ? suppliedCheckoutId.toLowerCase() : undefined;
    const rewardOnly = !!rewardProductId && !sanitizedProducts.length;
    const validPayment = rewardOnly
      ? paymentMethod === "Points"
      : ["Credit Card", "Debit Card", "QRIS", "Go Pay", "Grab Pay"].includes(paymentMethod);
    if (!validPayment || !["Delivery", "Dine in", "Take away"].includes(orderType ?? "Delivery") ||
        !Number.isFinite(totalAmount) || !req.user.userId ||
        (suppliedCheckoutId !== undefined && !uuidPattern.test(checkoutId)) ||
        (memberId !== undefined && (typeof memberId !== "string" || !uuidPattern.test(memberId) || !checkoutId)) ||
        (rewardProductId !== undefined && (typeof rewardProductId !== "string" ||
          !/^[a-f0-9]{24}$/.test(rewardProductId) || !memberId || !Number.isSafeInteger(rewardPoints))) ||
        sanitizedProducts.some((item) => !/^[a-f0-9]{24}$/.test(item.productId) || !item.name ||
          !Number.isFinite(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price < 0)) {
      return res.status(400).json({ message: "Invalid order details." });
    }
    if (memberId && !sanitizedProducts.length && !rewardOnly) {
      return res.status(400).json({ message: "Add a purchase or select a reward." });
    }

    const { saved, replayed } = await transaction(async (run) => {
      if (checkoutId) {
        // An unknown HTTP outcome may be retried on a different worker.
        await run("select pg_advisory_xact_lock(hashtextextended($1, 0))", [checkoutId]);
        const previous = await Order.byCheckoutId(checkoutId, run);
        if (previous) {
          if (previous.user !== req.user.userId) throw requestError("Checkout identifier is already in use.", 409);
          const canSee = !previous.membership || await hasMembershipAccess(req.user, run);
          return { saved: canSee ? previous : withoutMembershipDetails(previous), replayed: true };
        }
      }

      if (memberId && !await hasMembershipAccess(req.user, run)) {
        throw requestError("This cashier account needs membership access from a Boonz admin.", 403);
      }
      const loyalty = memberId && await prepareMemberOrder(run, {
        memberId, rewardProductId, rewardPoints, totalAmount,
      });
      if (loyalty) await validateMemberPrices(run, sanitizedProducts, products);
      const items = [...sanitizedProducts];
      if (loyalty?.reward) {
        items.push({
          productId: loyalty.reward.productId,
          name: loyalty.reward.name,
          quantity: 1,
          price: 0,
          note: "Membership reward",
          isReward: true,
        });
      }

      const saved = await Order.create({
        status: "pending",
        products: items,
        subtotal,
        tax,
        serviceCharge,
        discount: finalDiscount,
        discountNote: (discountNote || "None").toString().trim().slice(0, 140) || "None",
        totalAmount,
        checkoutId,
        user: req.user.userId,
        orderType: orderType ?? "Delivery",
        paymentMethod,
        promotion: promotion || promoId || null,
        customerEmail: loyalty?.member.email || (typeof customerEmail === "string" ? customerEmail.trim() || undefined : undefined),
        customerName: loyalty?.member.name || (typeof customerName === "string" ? customerName.trim() || undefined : undefined),
        membership: loyalty?.membership,
      }, run);

      if (loyalty) await recordMemberPoints(run, saved._id, loyalty.membership);
      return { saved, replayed: false };
    });
    if (replayed) return res.json({ ...saved, emailSent: Boolean(saved.receiptEmailSent) });

    // build once for emails
    const html = renderReceiptEmail(saved, { logoUrl });

    // owner email (fire and forget)
    if (Deno.env.get("ADMIN_EMAIL")) {
      const ownerEmail = sendMail({
        to: Deno.env.get("ADMIN_EMAIL"),
        subject: `New Order • #${saved.orderNumber}`,
        html,
        text: receiptText(saved),
        replyTo: DEFAULT_REPLY_TO,
      }).catch((e) => console.error("[orders] owner email failed:", e));
      if (globalThis.EdgeRuntime) globalThis.EdgeRuntime.waitUntil(ownerEmail);
      else await ownerEmail;
    }

    // optional customer email
    let emailSent = false;
    if ((sendEmail || saved.membership) && saved.customerEmail) {
      try {
        await sendMail({
          to: saved.customerEmail,
          subject: `Receipt • Order #${saved.orderNumber}`,
          html,
          text: receiptText(saved),
          replyTo: DEFAULT_REPLY_TO,
        });
        emailSent = true;
        if (checkoutId) await Order.markReceiptSent(saved._id).catch(() =>
          console.error("[orders] could not record receipt delivery")
        );
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
export const getOrders = async (req, res, next) => {
  try {
    const orders = await Order.list({ populate: true });
    res.json(await hasMembershipAccess(req.user) ? orders : orders.map(withoutMembershipDetails));
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

    if (order.membership && ["cancelled", "refunded"].includes(current)) {
      return res.status(400).json({ message: "A reversed membership order cannot be reopened." });
    }

    const updated = await transaction(async (run) => {
      const changed = await Order.updateStatus(id, current, status, run);
      if (changed?.membership && ["cancelled", "refunded"].includes(status)) {
        await recordMemberPoints(run, id, changed.membership, true);
      }
      return changed;
    });
    if (!updated) return res.status(409).json({ message: "Order status changed. Refresh and try again." });
    res.json(!updated.membership || await hasMembershipAccess(req.user) ? updated : withoutMembershipDetails(updated));
  } catch (err) {
    next(err);
  }
};

/* ------------------------- SEND/RESEND RECEIPT ------------------------- */
export const sendEmailReceipt = async (req, res, next) => {
  try {
    const { orderId } = req.params; // may be orderNumber or _id
    const { to, logoUrl } = req.body || {};

    const order = /^[a-f0-9]{24}$/.test(orderId)
      ? await Order.get(orderId)
      : await Order.byNumber(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (order.membership && !await hasMembershipAccess(req.user)) {
      return res.status(403).json({ message: "This cashier account needs membership access to resend this receipt." });
    }
    const destination = order.membership ? order.customerEmail : to;
    if (!destination) return res.status(400).json({ message: "Missing recipient email." });
    if (order.membership && to && normalizeEmail(to) !== normalizeEmail(destination)) {
      return res.status(400).json({ message: "Send a membership receipt to the member’s email on the order." });
    }
    const html = renderReceiptEmail(order, { logoUrl });

    await sendMail({
      to: destination,
      subject: `Receipt • Order #${order.orderNumber || order._id}`,
      html,
      text: receiptText(order),
      replyTo: DEFAULT_REPLY_TO,
    });

    if (order.checkoutId) await Order.markReceiptSent(order._id).catch(() =>
      console.error("[orders] could not record receipt delivery")
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
