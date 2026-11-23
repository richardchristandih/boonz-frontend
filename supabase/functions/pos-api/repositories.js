import { randomBytes } from "node:crypto";
import { query, transaction } from "./database.js";

const newId = () => randomBytes(12).toString("hex");
const timestamp = () => new Date().toISOString();
const result = (row) => row ? { ...row.data, _id: row.id } : null;

// The fixed table names below are the only identifiers interpolated into SQL.
function collection(name, timestamps = false) {
  const table = `pos_private.${name}`;
  return {
    async get(id) {
      const { rows } = await query(`select id, data from ${table} where id = $1`, [id]);
      return result(rows[0]);
    },
    async create(fields) {
      const createdAt = timestamp();
      const data = { ...fields, createdAt, ...(timestamps ? { updatedAt: createdAt } : {}) };
      const { rows } = await query(
        `insert into ${table} (id, data) values ($1, $2) returning id, data`,
        [newId(), data]
      );
      return result(rows[0]);
    },
    async update(id, fields) {
      const data = { ...fields, ...(timestamps ? { updatedAt: timestamp() } : {}) };
      const { rows } = await query(
        `update ${table} set data = data || $2::jsonb where id = $1 returning id, data`,
        [id, data]
      );
      return result(rows[0]);
    },
    async remove(id) {
      const { rows } = await query(`delete from ${table} where id = $1 returning id, data`, [id]);
      return result(rows[0]);
    },
  };
}

export const Product = {
  ...collection("products"),
  async list({ category = null, search = null, limit = null, offset = 0 }) {
    const filters = `
      where ($1::text is null or data->>'category' = $1)
        and ($2::text is null or strpos(lower(data->>'name'), lower($2)) > 0
          or strpos(lower(data->>'description'), lower($2)) > 0)`;
    const values = [category, search];
    const { rows } = await query(
      `select id, data from pos_private.products ${filters}
       order by data->>'createdAt' desc nulls last, id desc limit $3 offset $4`,
      [...values, limit, offset]
    );
    if (limit === null) return rows.map(result);
    const count = await query(`select count(*) from pos_private.products ${filters}`, values);
    return { items: rows.map(result), total: Number(count.rows[0].count) };
  },
};

export const Category = {
  ...collection("categories", true),
  async list() {
    const { rows } = await query(`
      select id, data from pos_private.categories
      order by (data->>'order')::numeric, data->>'createdAt' desc
    `);
    return rows.map(result);
  },
};

export const Promotion = {
  ...collection("promotions", true),
  async list(active) {
    const { rows } = await query(`
      select id, data from pos_private.promotions
      where ($1::boolean is null or (data->>'active')::boolean = $1)
      order by data->>'createdAt' desc nulls last, id desc
    `, [active]);
    return rows.map(result);
  },
};

export const Inventory = {
  ...collection("inventory", true),
  async list(category) {
    const { rows } = await query(`
      select id, data from pos_private.inventory
      where ($1::text is null or data->>'category' = $1)
      order by data->>'name', id
    `, [category]);
    return rows.map(result);
  },
  async setQuantity(id, quantity, note) {
    const update = { quantity, updatedAt: timestamp() };
    const { rows } = await query(`
      update pos_private.inventory
      set data = data || $2::jsonb || case
        when $3::text is null then '{}'::jsonb
        else jsonb_build_object('notes', concat_ws(chr(10), nullif(data->>'notes', ''), $3))
      end
      where id = $1 returning id, data
    `, [id, update, note]);
    return result(rows[0]);
  },
};

export const User = {
  ...collection("users"),
  async byEmail(email) {
    const { rows } = await query("select id, data from pos_private.users where data->>'email' = $1", [email]);
    return result(rows[0]);
  },
};

export const Setting = {
  async get(key) {
    const { rows } = await query("select data from pos_private.settings where data->>'key' = $1", [key]);
    return rows[0]?.data.data;
  },
  async set(key, data) {
    const now = timestamp();
    const { rows } = await query(`
      insert into pos_private.settings (id, data) values ($1, $2)
      on conflict ((data->>'key')) do update
      set data = settings.data || jsonb_build_object('data', excluded.data->'data', 'updatedAt', $3::text)
      returning data
    `, [newId(), { key, data, createdAt: now, updatedAt: now }, now]);
    return rows[0].data.data;
  },
};

export const Order = {
  ...collection("orders", true),
  async create(fields) {
    const createdAt = timestamp();
    return transaction(async (run) => {
      const { rows: [counter] } = await run(`
        insert into pos_private.order_counters (day, last_number) values ($1, 1)
        on conflict (day) do update set last_number = order_counters.last_number + 1
        returning last_number
      `, [createdAt.slice(0, 10)]);
      const data = { ...fields, orderNumber: counter.last_number, createdAt, updatedAt: createdAt };
      const { rows } = await run(
        "insert into pos_private.orders (id, data) values ($1, $2) returning id, data",
        [newId(), data]
      );
      return result(rows[0]);
    });
  },
  async list({ populate = false, includeVoids = true } = {}) {
    const { rows } = await query(`
      select id, data from pos_private.orders
      where ($1::boolean or coalesce(data->>'status', 'pending') not in ('cancelled', 'refunded'))
      order by data->>'createdAt' desc nulls last, id desc
    `, [includeVoids]);
    const orders = rows.map(result);
    if (!populate) return orders;

    const ids = [...new Set(orders.flatMap((order) => (order.products || []).map((item) => item.productId)))];
    const products = await query("select id, data from pos_private.products where id = any($1::text[])", [ids]);
    const byId = new Map(products.rows.map((row) => [row.id, result(row)]));
    for (const order of orders) {
      order.products = (order.products || []).map((item) => ({
        ...item,
        productId: byId.get(item.productId) || null,
      }));
    }
    return orders;
  },
  async byNumber(number) {
    const { rows } = await query(`
      select id, data from pos_private.orders where data->>'orderNumber' = $1
      order by data->>'createdAt' desc nulls last, id desc limit 1
    `, [String(number)]);
    return result(rows[0]);
  },
  async updateStatus(id, expectedStatus, status) {
    const { rows } = await query(`
      update pos_private.orders set data = data || $2::jsonb
      where id = $1 and coalesce(data->>'status', 'pending') = $3 returning id, data
    `, [id, { status, updatedAt: timestamp() }, expectedStatus]);
    return result(rows[0]);
  },
};
