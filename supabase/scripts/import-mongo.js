// One-time import into an empty Supabase database. MongoDB is read-only.
import { MongoClient } from "npm:mongodb@6.14.2";
import pg from "npm:pg@8.23.1";

const sourceUrl = Deno.env.get("MONGODB_URI");
const targetUrl = Deno.env.get("POS_IMPORT_DATABASE_URL");
if (!sourceUrl || !targetUrl) {
  console.error("Set MONGODB_URI and POS_IMPORT_DATABASE_URL in a local environment file.");
  Deno.exit(1);
}

const collections = {
  categories: "categories",
  products: "products",
  promotions: "promotions",
  inventories: "inventory",
  users: "users",
  settings: "settings",
  orders: "orders",
};

const mongo = new MongoClient(sourceUrl, { serverSelectionTimeoutMS: 10000 });
const postgres = new pg.Client({ connectionString: targetUrl, connectionTimeoutMillis: 10000 });

let transactionOpen = false;
try {
  await mongo.connect();
  const database = mongo.db(Deno.env.get("MONGODB_DATABASE") || undefined);
  const available = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  if (!available.has("users") || !available.has("products")) {
    throw new Error("The MongoDB database must contain the POS users and products collections.");
  }

  await postgres.connect();
  await postgres.query("begin");
  transactionOpen = true;
  const counts = {};
  const tables = [...Object.values(collections), "order_counters"].map((name) => `pos_private.${name}`);
  await postgres.query(`lock table ${tables.join(", ")} in exclusive mode`);
  for (const table of tables) {
    const { rowCount } = await postgres.query(`select 1 from ${table} limit 1`);
    if (rowCount) throw new Error("The Supabase POS database must be empty before importing.");
  }

  for (const [source, target] of Object.entries(collections)) {
    let count = 0;
    if (available.has(source)) {
      for await (const { _id, ...fields } of database.collection(source).find({})) {
        await postgres.query(
          `insert into pos_private.${target} (id, data) values ($1, $2)`,
          [String(_id), fields]
        );
        count++;
      }
    }
    counts[target] = count;
  }

  await postgres.query(`
    insert into pos_private.order_counters (day, last_number)
    select ((data->>'createdAt')::timestamptz at time zone 'UTC')::date,
           greatest(max((data->>'orderNumber')::integer), count(*))::integer
    from pos_private.orders
    where data->>'createdAt' is not null and data->>'orderNumber' is not null
    group by 1
  `);
  await postgres.query("commit");
  transactionOpen = false;
  console.log("Import committed.", counts);
} catch (error) {
  if (transactionOpen) await postgres.query("rollback").catch(() => {});
  // Do not log database URI, driver details, or record contents.
  const message = error.code ? `Database error (${error.code}).` : error.message;
  console.error("Import failed.", message);
  Deno.exitCode = 1;
} finally {
  await Promise.allSettled([mongo.close(), postgres.end()]);
}
