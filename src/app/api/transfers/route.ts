import { NextResponse } from "next/server";
import {
  findAccountById,
  formatAccount,
  walletTransfer,
} from "@/lib/accounts";
import {
  getIdempotencyKey,
  handleRouteError,
  jsonError,
  toMoneyParam,
} from "@/lib/api";
import { transferSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fromId, toId, amount } = transferSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(req);

    const operationId = await walletTransfer(
      fromId,
      toId,
      toMoneyParam(amount),
      idempotencyKey,
    );

    const [fromAccount, toAccount] = await Promise.all([
      findAccountById(fromId),
      findAccountById(toId),
    ]);

    if (!fromAccount || !toAccount) {
      return jsonError(404, "Una de las cuentas de la transferencia no existe");
    }

    return NextResponse.json({
      operationId,
      from: formatAccount(fromAccount),
      to: formatAccount(toAccount),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
