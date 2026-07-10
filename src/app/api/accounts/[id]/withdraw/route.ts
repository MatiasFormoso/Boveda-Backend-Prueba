import { NextResponse } from "next/server";
import {
  findAccountById,
  formatAccount,
  walletWithdraw,
} from "@/lib/accounts";
import {
  getIdempotencyKey,
  handleRouteError,
  jsonError,
  toMoneyParam,
} from "@/lib/api";
import { accountIdParamSchema, withdrawSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = accountIdParamSchema.parse(await params);
    const body = await req.json();
    const { amount } = withdrawSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(req);

    const operationId = await walletWithdraw(
      id,
      toMoneyParam(amount),
      idempotencyKey,
    );

    const account = await findAccountById(id);
    if (!account) {
      return jsonError(404, `La cuenta ${id} no existe`);
    }

    return NextResponse.json({
      operationId,
      account: formatAccount(account),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
