import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "sql", "boveda_schema.sql");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL en el entorno");
    process.exit(1);
  }

  const sql = readFileSync(schemaPath, "utf8");
  const pool = new pg.Pool({ connectionString: url });

  try {
    await pool.query(sql);
    const { rows } = await pool.query(
      "SELECT titular, balance FROM accounts ORDER BY titular",
    );
    console.log("Esquema aplicado. Cuentas:");
    for (const row of rows) {
      console.log(`  ${row.titular}: ${row.balance}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
