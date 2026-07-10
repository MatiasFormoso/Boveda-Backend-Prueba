import { NextResponse } from "next/server";
import type { DatabaseError } from "pg";
import { ZodError } from "zod";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) {
    const message = err.errors[0]?.message ?? "Datos inválidos";
    return jsonError(422, message);
  }

  const pg = err as DatabaseError;
  if (pg.code) {
    const mapped = mapPgError(pg);
    if (mapped) return jsonError(mapped.status, mapped.message);
  }

  console.error(err);
  return jsonError(500, "Error interno del servidor");
}

/** Traduce excepciones PL/pgSQL a códigos HTTP del contrato de la API. */
function mapPgError(err: DatabaseError): { status: number; message: string } | null {
  const message = cleanPgMessage(err.message);

  // no_data_found → 404
  if (err.code === "P0002" || err.code === "02000") {
    return { status: 404, message };
  }

  // CHECK saldo o RAISE saldo insuficiente → 409
  if (err.code === "23514" || message.toLowerCase().includes("saldo insuficiente")) {
    return { status: 409, message };
  }

  // Monto inválido o misma cuenta en transferencia → 400
  if (
    err.code === "22023" ||
    message.toLowerCase().includes("debe ser mayor a cero") ||
    message.toLowerCase().includes("no pueden ser la misma")
  ) {
    return { status: 400, message };
  }

  if (message.toLowerCase().includes("no existe")) {
    return { status: 404, message };
  }

  // UUID mal formado en parámetro de ruta → 400
  if (err.code === "22P02") {
    return { status: 400, message: "Identificador de cuenta inválido" };
  }

  return null;
}

function cleanPgMessage(raw: string): string {
  const line = raw.split("\n")[0] ?? raw;
  return line.replace(/^ERROR:\s*/i, "").trim();
}

export function getIdempotencyKey(req: Request): string | null {
  const key = req.headers.get("Idempotency-Key")?.trim();
  return key ? key : null;
}

export function toMoneyParam(amount: number): string {
  return amount.toFixed(2);
}
