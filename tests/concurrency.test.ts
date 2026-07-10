import { afterAll, describe, expect, it } from "vitest";
import type { DatabaseError } from "pg";
import {
  createAccount,
  findAccountById,
  walletDeposit,
  walletWithdraw,
} from "@/lib/accounts";
import { pool } from "@/lib/db";

const CONCURRENT_WITHDRAWS = 50;
const WITHDRAW_AMOUNT = "10.00";
const INITIAL_BALANCE = "100.00";
const EXPECTED_SUCCESS = 10;
const EXPECTED_FAILURE = 40;

describe("concurrencia — wallet_withdraw bajo carga extrema", () => {
  let accountId: string;

  afterAll(async () => {
    await pool.end();
  });

  it("solo permite retiros hasta agotar el saldo sin dejar balance negativo", async () => {
    const account = await createAccount(
      `concurrency-test-${Date.now()}`,
    );
    accountId = account.id;

    await walletDeposit(accountId, INITIAL_BALANCE, null, "Carga para test");

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_WITHDRAWS }, (_, index) =>
        walletWithdraw(
          accountId,
          WITHDRAW_AMOUNT,
          `concurrency-withdraw-${index}`,
          "Retiro concurrente",
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(EXPECTED_SUCCESS);
    expect(failed).toHaveLength(EXPECTED_FAILURE);

    for (const failure of failed) {
      if (failure.status !== "rejected") continue;
      const pg = failure.reason as DatabaseError;
      expect(pg.message).toMatch(/Saldo insuficiente/i);
    }

    const finalAccount = await findAccountById(accountId);
    expect(finalAccount).not.toBeNull();
    expect(finalAccount!.balance).toBe("0.00");

    const balance = Number(finalAccount!.balance);
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});
