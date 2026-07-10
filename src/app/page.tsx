import { pool } from "@/lib/db";

export default async function Home() {
  let dbStatus = "sin conectar";

  try {
    const result = await pool.query("SELECT now() AS ts");
    dbStatus = `ok (${result.rows[0].ts.toISOString()})`;
  } catch {
    dbStatus = "error de conexión";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Bóveda API</h1>
      <p className="text-neutral-600">
        Backend de la billetera digital. Los endpoints viven bajo{" "}
        <code className="rounded bg-neutral-100 px-1">/api</code>.
      </p>
      <p className="text-sm text-neutral-500">
        PostgreSQL: <span className="font-mono">{dbStatus}</span>
      </p>
    </main>
  );
}
