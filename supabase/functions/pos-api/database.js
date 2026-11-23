import pg from "npm:pg@8.23.1";

const connectionString = Deno.env.get("POS_DATABASE_URL") || Deno.env.get("SUPABASE_DB_URL");
if (!connectionString) throw new Error("Configure the POS database connection.");

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});

pool.on("error", (error) => console.error("Idle database connection failed", error.code));

export const query = (text, values) => pool.query(text, values);

export async function transaction(work) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("begin");
    const result = await work((text, values) => client.query(text, values));
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      connectionError = rollbackError;
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}
