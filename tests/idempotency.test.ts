import { describe, expect, it } from "vitest";
import {
  createAccount,
  findAccountById,
  walletDeposit,
  walletTransfer,
  walletWithdraw,
} from "@/lib/accounts";

describe("idempotencia — reintentos con la misma clave", () => {
  it("deposit: no duplica el acreditado", async () => {
    const account = await createAccount(`idem-deposit-${Date.now()}`);
    const key = `deposit-key-${Date.now()}`;

    const firstOp = await walletDeposit(
      account.id,
      "100.00",
      key,
      "Carga idempotente",
    );
    const secondOp = await walletDeposit(
      account.id,
      "100.00",
      key,
      "Carga idempotente",
    );

    expect(secondOp).toBe(firstOp);

    const updated = await findAccountById(account.id);
    expect(updated!.balance).toBe("100.00");
  });

  it("withdraw: no duplica el débito", async () => {
    const account = await createAccount(`idem-withdraw-${Date.now()}`);
    const key = `withdraw-key-${Date.now()}`;

    await walletDeposit(account.id, "200.00", null, "Carga inicial");

    const firstOp = await walletWithdraw(
      account.id,
      "50.00",
      key,
      "Débito idempotente",
    );
    const secondOp = await walletWithdraw(
      account.id,
      "50.00",
      key,
      "Débito idempotente",
    );

    expect(secondOp).toBe(firstOp);

    const updated = await findAccountById(account.id);
    expect(updated!.balance).toBe("150.00");
  });

  it("transfer: no duplica la transferencia", async () => {
    const from = await createAccount(`idem-from-${Date.now()}`);
    const to = await createAccount(`idem-to-${Date.now()}`);
    const key = `transfer-key-${Date.now()}`;

    await walletDeposit(from.id, "300.00", null, "Carga origen");

    const firstOp = await walletTransfer(
      from.id,
      to.id,
      "75.00",
      key,
      "Transferencia idempotente",
    );
    const secondOp = await walletTransfer(
      from.id,
      to.id,
      "75.00",
      key,
      "Transferencia idempotente",
    );

    expect(secondOp).toBe(firstOp);

    const fromUpdated = await findAccountById(from.id);
    const toUpdated = await findAccountById(to.id);
    expect(fromUpdated!.balance).toBe("225.00");
    expect(toUpdated!.balance).toBe("75.00");
  });
});
