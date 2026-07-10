import { describe, expect, it } from "vitest";
import type { DatabaseError } from "pg";
import {
  createAccount,
  findAccountById,
  listMovements,
  walletDeposit,
  walletWithdraw,
} from "@/lib/accounts";

const CONCURRENT_WITHDRAWS = 50;
const WITHDRAW_AMOUNT = "10.00";
const INITIAL_BALANCE = "100.00";
const MAX_SUCCESSFUL_WITHDRAWS = 10;

describe("concurrencia — wallet_withdraw bajo carga extrema", () => {
  it("solo permite retiros hasta agotar el saldo sin dejar balance negativo", async () => {
    const runId = Date.now();
    const account = await createAccount(`concurrency-test-${runId}`);

    await walletDeposit(account.id, INITIAL_BALANCE, null, "Carga para test");

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_WITHDRAWS }, (_, index) =>
        walletWithdraw(
          account.id,
          WITHDRAW_AMOUNT,
          `concurrency-${runId}-withdraw-${index}`,
          "Retiro concurrente",
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded.length + failed.length).toBe(CONCURRENT_WITHDRAWS);
    expect(succeeded).toHaveLength(MAX_SUCCESSFUL_WITHDRAWS);
    expect(failed).toHaveLength(CONCURRENT_WITHDRAWS - MAX_SUCCESSFUL_WITHDRAWS);

    for (const failure of failed) {
      if (failure.status !== "rejected") continue;
      const pg = failure.reason as DatabaseError;
      expect(pg.message).toMatch(/Saldo insuficiente/i);
    }

    const finalAccount = await findAccountById(account.id);
    expect(finalAccount).not.toBeNull();
    expect(finalAccount!.balance).toBe("0.00");

    const debits = (await listMovements(account.id)).filter(
      (m) => m.type === "debito",
    );
    expect(debits).toHaveLength(MAX_SUCCESSFUL_WITHDRAWS);
    expect(
      debits.reduce((sum, m) => sum + Number(m.amount), 0),
    ).toBe(Number(INITIAL_BALANCE));
  });
});
