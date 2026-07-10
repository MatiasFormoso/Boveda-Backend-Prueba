import { NextResponse } from "next/server";
import {
  createAccount,
  formatAccount,
  listAccounts,
} from "@/lib/accounts";
import { handleRouteError } from "@/lib/api";
import { createAccountSchema } from "@/lib/validations";

export async function GET() {
  try {
    const accounts = await listAccounts();
    return NextResponse.json(accounts.map(formatAccount));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { titular } = createAccountSchema.parse(body);
    const account = await createAccount(titular);
    return NextResponse.json(formatAccount(account), { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
