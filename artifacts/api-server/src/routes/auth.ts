import { Router, type IRouter } from "express";
import { Api } from "telegram";
import { computeCheck } from "telegram/Password";
import { getClient, isAuthenticated, getPhone, persistSession, clearSession } from "../lib/telegram";
import {
  GetAuthStatusResponse,
  SendCodeBody,
  SendCodeResponse,
  SignInBody,
  SignInResponse,
  SignIn2faBody,
  SignIn2faResponse,
  LogoutResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/auth/status", async (req, res): Promise<void> => {
  const authenticated = await isAuthenticated();
  const phone = authenticated ? await getPhone() : null;
  res.json(GetAuthStatusResponse.parse({ authenticated, phone }));
});

router.post("/auth/send-code", async (req, res): Promise<void> => {
  const parsed = SendCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: parsed.data.phone,
        apiId: parseInt(process.env.TELEGRAM_API_ID ?? "", 10),
        apiHash: process.env.TELEGRAM_API_HASH ?? "",
        settings: new Api.CodeSettings({}),
      })
    );

    const phoneCodeHash = (result as Api.auth.SentCode).phoneCodeHash;
    res.json(SendCodeResponse.parse({ phoneCodeHash }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send code";
    req.log.error({ err }, "send-code failed");
    res.status(400).json({ error: msg });
  }
});

router.post("/auth/sign-in", async (req, res): Promise<void> => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const client = await getClient();
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: parsed.data.phone,
        phoneCodeHash: parsed.data.phoneCodeHash,
        phoneCode: parsed.data.code,
      })
    );

    await persistSession(parsed.data.phone);
    res.json(SignInResponse.parse({ authenticated: true, requires2fa: false, phone: parsed.data.phone }));
  } catch (err: unknown) {
    // Check for 2FA required
    if (err instanceof Error && err.message.includes("SESSION_PASSWORD_NEEDED")) {
      await persistSession(parsed.data.phone);
      res.json(SignInResponse.parse({ authenticated: false, requires2fa: true, phone: parsed.data.phone }));
      return;
    }
    const msg = err instanceof Error ? err.message : "Failed to sign in";
    req.log.error({ err }, "sign-in failed");
    res.status(400).json({ error: msg });
  }
});

router.post("/auth/sign-in-2fa", async (req, res): Promise<void> => {
  const parsed = SignIn2faBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const client = await getClient();
    const pwdInfo = await client.invoke(new Api.account.GetPassword());
    await client.invoke(
      new Api.auth.CheckPassword({
        password: await computeCheck(pwdInfo, parsed.data.password),
      })
    );

    await persistSession();
    const phone = await getPhone();
    res.json(SignIn2faResponse.parse({ authenticated: true, phone }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to sign in with 2FA";
    req.log.error({ err }, "sign-in-2fa failed");
    res.status(400).json({ error: msg });
  }
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  try {
    const client = await getClient();
    await client.invoke(new Api.auth.LogOut());
  } catch {}
  await clearSession();
  res.json(LogoutResponse.parse({ authenticated: false, phone: null }));
});

export default router;
