import { query } from "@/lib/db";

export interface AccountRow {
  id: string;
  titular: string;
  balance: string;
  created_at: Date;
  updated_at: Date;
}

export interface MovementFilters {
  startDate?: Date;
  endDate?: Date;
  types?: string[];
}

export interface AccountSummaryRow {
  id: string;
  titular: string;
  balance: string;
  total_acreditado: string;
  total_debitado: string;
  cantidad_movimientos: string;
}

export interface MovementRow {
  id: string;
  operation_id: string;
  account_id: string;
  type: string;
  amount: string;
  balance_after: string;
  description: string | null;
  created_at: Date;
}

export function formatAccount(row: AccountRow) {
  return {
    id: row.id,
    titular: row.titular,
    balance: row.balance,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function formatMovement(row: MovementRow) {
  return {
    id: row.id,
    operationId: row.operation_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    description: row.description,
    createdAt: row.created_at.toISOString(),
  };
}

export function formatAccountSummary(row: AccountSummaryRow) {
  return {
    id: row.id,
    titular: row.titular,
    balance: row.balance,
    totalAcreditado: row.total_acreditado,
    totalDebitado: row.total_debitado,
    cantidadMovimientos: Number(row.cantidad_movimientos),
  };
}

export async function findAccountById(id: string) {
  const result = await query<AccountRow>(
    `SELECT id, titular, balance, created_at, updated_at
     FROM accounts WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listAccounts() {
  const result = await query<AccountRow>(
    `SELECT id, titular, balance, created_at, updated_at
     FROM accounts ORDER BY titular`,
  );
  return result.rows;
}

export async function listMovements(
  accountId: string,
  filters?: MovementFilters,
) {
  const conditions = ["account_id = $1"];
  const params: unknown[] = [accountId];
  let index = 2;

  if (filters?.startDate) {
    conditions.push(`created_at >= $${index}`);
    params.push(filters.startDate);
    index++;
  }

  if (filters?.endDate) {
    conditions.push(`created_at <= $${index}`);
    params.push(filters.endDate);
    index++;
  }

  if (filters?.types && filters.types.length > 0) {
    conditions.push(`type = ANY($${index}::movement_type[])`);
    params.push(filters.types);
    index++;
  }

  const result = await query<MovementRow>(
    `SELECT id, operation_id, account_id, type, amount, balance_after, description, created_at
     FROM movements
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );
  return result.rows;
}

export async function getAccountSummary(accountId: string) {
  const result = await query<AccountSummaryRow>(
    `SELECT id, titular, balance, total_acreditado, total_debitado, cantidad_movimientos
     FROM account_summary
     WHERE id = $1`,
    [accountId],
  );
  return result.rows[0] ?? null;
}

export async function createAccount(titular: string) {
  const result = await query<AccountRow>(
    `INSERT INTO accounts (titular) VALUES ($1)
     RETURNING id, titular, balance, created_at, updated_at`,
    [titular],
  );
  return result.rows[0];
}

export async function walletDeposit(
  accountId: string,
  amount: string,
  idempotencyKey: string | null,
  description?: string | null,
) {
  const result = await query<{ wallet_deposit: string }>(
    `SELECT wallet_deposit($1, $2::numeric, $3, $4) AS wallet_deposit`,
    [accountId, amount, idempotencyKey, description],
  );
  return result.rows[0].wallet_deposit;
}

export async function walletWithdraw(
  accountId: string,
  amount: string,
  idempotencyKey: string | null,
  description?: string | null,
) {
  const result = await query<{ wallet_withdraw: string }>(
    `SELECT wallet_withdraw($1, $2::numeric, $3, $4) AS wallet_withdraw`,
    [accountId, amount, idempotencyKey, description],
  );
  return result.rows[0].wallet_withdraw;
}

export async function walletTransfer(
  fromId: string,
  toId: string,
  amount: string,
  idempotencyKey: string | null,
  description?: string | null,
) {
  const result = await query<{ wallet_transfer: string }>(
    `SELECT wallet_transfer($1, $2, $3::numeric, $4, $5) AS wallet_transfer`,
    [fromId, toId, amount, idempotencyKey, description],
  );
  return result.rows[0].wallet_transfer;
}
