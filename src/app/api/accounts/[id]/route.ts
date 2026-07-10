import { NextResponse } from "next/server";
import { findAccountById, formatAccount } from "@/lib/accounts";
import { handleRouteError, jsonError } from "@/lib/api";
import { accountIdParamSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = accountIdParamSchema.parse(await params);
    const account = await findAccountById(id);

    if (!account) {
      return jsonError(404, `La cuenta ${id} no existe`);
    }

    return NextResponse.json(formatAccount(account));
  } catch (err) {
    return handleRouteError(err);
  }
}
