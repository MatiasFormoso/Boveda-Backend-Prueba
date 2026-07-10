import { query } from "@/lib/db";

export interface AccountRow {
  id: string;
  titular: string;
  balance: string;
  created_at: Date;
  updated_at: Date;
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

export async function listMovements(accountId: string) {
  const result = await query<MovementRow>(
    `SELECT id, operation_id, account_id, type, amount, balance_after, description, created_at
     FROM movements
     WHERE account_id = $1
     ORDER BY created_at DESC`,
    [accountId],
  );
  return result.rows;
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
