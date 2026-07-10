export async function teardown() {
  const { pool } = await import("../src/lib/db.js");
  await pool.end();
}
