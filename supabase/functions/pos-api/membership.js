import { query, transaction } from "./database.js";
import { Setting } from "./repositories.js";

const DEFAULT_RUPIAH_PER_POINT = 10000;
const DEFAULT_REDEMPTION_VALUE = 1000;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const memberColumns = 'id, name, email, phone, points::double precision as points, created_at as "createdAt"';

export function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const clean = (value) => typeof value === "string" ? value.trim() : "";
export const normalizeEmail = (value) => clean(value).toLowerCase();

function normalizePhone(value) {
  const raw = clean(value);
  if (!/^\+?[\d\s().-]{8,30}$/.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return "+" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+62" + digits.slice(1);
  return digits.startsWith("62") ? "+" + digits : "";
}

function memberDetails(body) {
  const name = clean(body?.name);
  const email = normalizeEmail(body?.email);
  const phone = normalizePhone(body?.phone);
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) throw requestError("Enter the member’s name.");
  if (email.length > 254 || !emailPattern.test(email)) throw requestError("Enter a valid email address.");
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) throw requestError("Enter a valid phone number, including the country code when needed.");
  return [name, email, phone];
}

export async function getMembershipProgram() {
  const [rules, { rows: rewards }] = await Promise.all([
    Setting.get("membership"),
    query(`
      select r.product_id as "productId", p.data->>'name' as name, r.points, r.active
      from pos_private.member_rewards r join pos_private.products p on p.id = r.product_id
      order by lower(p.data->>'name'), p.id
    `),
  ]);
  return {
    rupiahPerPoint: rules?.rupiahPerPoint ?? DEFAULT_RUPIAH_PER_POINT,
    redemptionValue: rules?.redemptionValue ?? DEFAULT_REDEMPTION_VALUE,
    rewards,
  };
}

export async function setMembershipProgram(body) {
  const { rupiahPerPoint, redemptionValue } = body || {};
  const validRate = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 1000000000;
  if (!validRate(rupiahPerPoint) || (redemptionValue !== undefined && !validRate(redemptionValue))) {
    throw requestError("Enter whole-rupiah amounts between 1 and 1,000,000,000.");
  }
  const current = redemptionValue === undefined ? await Setting.get("membership") : null;
  return Setting.set("membership", {
    rupiahPerPoint,
    redemptionValue: redemptionValue ?? current?.redemptionValue ?? DEFAULT_REDEMPTION_VALUE,
  });
}

export async function saveMemberReward(productId, body) {
  const { points, active } = body || {};
  if (!Number.isInteger(points) || points < 1 || points > 1000000 || typeof active !== "boolean") {
    throw requestError("Enter a reward cost from 1 to 1,000,000 points.");
  }
  const { rows: [reward] } = await query(`
    insert into pos_private.member_rewards (product_id, points, active)
    select id, $2, $3 from pos_private.products where id = $1
    on conflict (product_id) do update set points = excluded.points, active = excluded.active
    returning product_id as "productId", points, active
  `, [productId, points, active]);
  if (!reward) throw requestError("Product not found.", 404);
  return reward;
}

export async function findMember(value) {
  const identifier = clean(value);
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  if (!emailPattern.test(email) && !phone) throw requestError("Enter an email address or full phone number.");
  const { rows: [member] } = await query(`
    select ${memberColumns} from pos_private.members where email = $1 or phone = $2
  `, [email, phone]);
  if (!member) throw requestError("No member found.", 404);
  return member;
}

export async function listMembers({ q, offset = 0 }) {
  const term = clean(q).slice(0, 254).toLowerCase();
  const digits = /^[+\d\s().-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  const phone = normalizePhone(term) || (digits.length >= 2
    ? (digits.startsWith("0") ? "+62" + digits.slice(1) : digits) : null);
  const { rows } = await query(`
    select ${memberColumns} from pos_private.members
    where strpos(lower(name), $1) > 0 or strpos(email, $1) > 0 or strpos(phone, $2) > 0 or $1 = ''
    order by lower(name), id limit 31 offset $3
  `, [term, phone, offset]);
  return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
}

export async function saveMember(body, id) {
  const details = memberDetails(body);
  const { rows: [member] } = id
    ? await query(`update pos_private.members set name = $1, email = $2, phone = $3
                   where id = $4 returning ${memberColumns}`, [...details, id])
    : await query(`insert into pos_private.members (name, email, phone) values ($1, $2, $3)
                   returning ${memberColumns}`, details);
  if (!member) throw requestError("Member not found.", 404);
  return member;
}

export async function adjustMemberPoints(memberId, adminId, body) {
  const { points, expectedPoints } = body || {};
  const reason = clean(body?.reason);
  if (!Number.isSafeInteger(points) || points < 0 || !Number.isSafeInteger(expectedPoints)) {
    throw requestError("Enter a non-negative whole number for the new balance.");
  }
  if (!reason || reason.length > 240) throw requestError("Enter a reason of up to 240 characters.");

  return transaction(async (run) => {
    const { rows: [member] } = await run(`
      select ${memberColumns} from pos_private.members where id = $1 for update
    `, [memberId]);
    if (!member) throw requestError("Member not found.", 404);
    if (member.points !== expectedPoints) return { member, conflict: true };
    if (member.points === points) throw requestError("Enter a balance different from the current balance.");

    await run(`
      insert into pos_private.member_point_adjustments (member_id, adjusted_by, balance_before, balance_after, reason)
      values ($1, $2, $3, $4, $5)
    `, [memberId, adminId, member.points, points, reason]);
    await run("update pos_private.members set points = $2 where id = $1", [memberId, points]);
    return { member: { ...member, points }, conflict: false };
  });
}

export async function memberActivity(memberId, includeAuditDetails) {
  const { rows } = await query(`
    select id, kind, points::double precision as points, "createdAt", "orderNumber",
      case when $2 then reason end as reason, case when $2 then "adjustedBy" end as "adjustedBy"
    from (
      select 'order-' || l.id as id, l.kind, l.points::bigint as points, l.created_at as "createdAt",
        o.data->>'orderNumber' as "orderNumber", null::text as reason, null::text as "adjustedBy", l.id as sequence
      from pos_private.member_points l join pos_private.orders o on o.id = l.order_id
      where l.member_id = $1
      union all
      select 'adjustment-' || a.id, 'adjustment', a.balance_after - a.balance_before, a.created_at,
        null, a.reason, u.data->>'name', a.id
      from pos_private.member_point_adjustments a
      join pos_private.users u on u.id = a.adjusted_by
      where a.member_id = $1
    ) activity
    order by "createdAt" desc, sequence desc limit 50
  `, [memberId, includeAuditDetails]);
  return rows;
}

// Keep the paid loyalty order in sync with the catalog and the register's drink add-ons.
const toppingSkus = new Set(["TPD-BB-040", "TPD-GJ-040", "TPD-LJ-040"]);
const toppingPrice = 4000;

export async function validateMemberPrices(run, items, requestedItems) {
  if (!items.length) return;
  const ids = [...new Set(items.map((item) => item.productId))].sort();
  const { rows } = await run(`
    select id, data->>'price' as price, data->>'sku' as sku from pos_private.products
    where id = any($1::text[]) order by id for share
  `, [ids]);
  const catalog = new Map(rows.map((product) => [product.id, product]));
  for (const [index, item] of items.entries()) {
    const product = catalog.get(item.productId);
    const toppings = requestedItems[index]?.options?.toppings ?? [];
    const validToppings = Array.isArray(toppings) && new Set(toppings).size === toppings.length &&
      toppings.every((sku) => toppingSkus.has(sku) && product?.sku?.toUpperCase().startsWith("DRT"));
    const catalogPrice = product && Number(product.price) + (validToppings ? toppings.length * toppingPrice : 0);
    if (!product || product.price === null || !validToppings ||
        Math.round(item.price * 100) !== Math.round(catalogPrice * 100)) {
      throw requestError("An item or its price changed. Refresh the catalog and add it again.", 409);
    }
  }
}

export async function prepareMemberOrder(run, {
  memberId, rewardProductId, rewardPoints, discountPoints, redemptionValue, totalAmount,
}) {
  const { rows: [member] } = await run(`
    select ${memberColumns} from pos_private.members where id = $1 for update
  `, [memberId]);
  if (!member) throw requestError("Member not found. Look them up again.", 404);

  let reward;
  if (rewardProductId) {
    const { rows: [available] } = await run(`
      select r.points, p.data->>'name' as name
      from pos_private.member_rewards r join pos_private.products p on p.id = r.product_id
      where r.product_id = $1 and r.active
      for share of r, p
    `, [rewardProductId]);
    if (!available || available.points !== rewardPoints) {
      throw requestError("This reward changed. Refresh the member and choose it again.", 409);
    }
    if (member.points < available.points) throw requestError("This member no longer has enough points.", 409);
    reward = { productId: rewardProductId, ...available };
  }

  const { rows: [rule] } = await run(
    "select data->'data' as settings from pos_private.settings where data->>'key' = 'membership' for share"
  );
  const value = rule?.settings?.redemptionValue ?? DEFAULT_REDEMPTION_VALUE;
  if (discountPoints && value !== redemptionValue) {
    throw requestError("The points value changed. Review membership before taking payment.", 409);
  }
  if (discountPoints && discountPoints > member.points) {
    throw requestError("This member no longer has enough points.", 409);
  }
  const discountAmount = (discountPoints || 0) * value;
  const totalCents = Math.round(totalAmount * 100);
  if (!Number.isSafeInteger(discountAmount * 100) || discountAmount * 100 > totalCents) {
    throw requestError("The points discount exceeds the amount due. Review membership.", 409);
  }
  const payable = discountAmount ? (totalCents - discountAmount * 100) / 100 : totalAmount;
  const earningRate = rule?.settings?.rupiahPerPoint ?? DEFAULT_RUPIAH_PER_POINT;
  const earned = Math.floor(Math.round(payable * 100) / 100 / earningRate);
  const redeemed = reward?.points ?? discountPoints ?? 0;
  if (earned > 100000000) throw requestError("This order exceeds the points limit.");
  return {
    member, reward, payable, discountAmount,
    membership: {
      memberId, earned, redeemed, balance: member.points + earned - redeemed,
      ...(discountAmount ? { discountAmount } : {}),
    },
  };
}

export async function recordMemberPoints(run, orderId, membership, reverse = false) {
  const { memberId, earned, redeemed } = membership;
  const delta = (earned - redeemed) * (reverse ? -1 : 1);
  for (const [kind, points] of [
    [reverse ? "earn_reversed" : "earned", reverse ? -earned : earned],
    [reverse ? "redemption_returned" : "redeemed", reverse ? redeemed : -redeemed],
  ]) {
    if (points) await run(
      "insert into pos_private.member_points (member_id, order_id, kind, points) values ($1, $2, $3, $4)",
      [memberId, orderId, kind, points]
    );
  }
  if (delta) await run("update pos_private.members set points = points + $2 where id = $1", [memberId, delta]);
}

export async function hasMembershipAccess(user, run = query) {
  if (["admin", "superadmin"].includes(user?.role)) return true;
  const { rowCount } = await run("select 1 from pos_private.membership_staff where user_id = $1", [user?.userId]);
  return rowCount > 0;
}

export async function listMembershipStaff() {
  const { rows } = await query(`
    select u.id, u.data->>'name' as name, u.data->>'email' as email, s.user_id is not null as allowed
    from pos_private.users u left join pos_private.membership_staff s on s.user_id = u.id
    where coalesce(u.data->>'role', 'user') not in ('admin', 'superadmin')
    order by lower(u.data->>'name'), u.id
  `);
  return rows;
}

export async function setMembershipStaff(userId, allowed) {
  if (typeof allowed !== "boolean" || !/^[a-f0-9]{24}$/.test(userId)) {
    throw requestError("Select a cashier and access level.");
  }
  if (allowed) {
    const { rowCount } = await query(`
      insert into pos_private.membership_staff (user_id)
      select id from pos_private.users where id = $1
      on conflict (user_id) do update set user_id = excluded.user_id
    `, [userId]);
    if (!rowCount) throw requestError("Cashier account not found.", 404);
  } else {
    await query("delete from pos_private.membership_staff where user_id = $1", [userId]);
  }
  return { userId, allowed };
}

export function withoutMembershipDetails(order) {
  if (!order.membership) return order;
  const { membership, customerName, customerEmail, ...remaining } = order;
  return remaining;
}
