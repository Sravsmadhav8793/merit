import { startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

type Passkey = { id: string; createdAt: string; lastUsedAt: string | null };

export default function PasskeySettings() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/passkey/list", { credentials: "same-origin" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    if (!response.ok) throw new Error("Could not load passkeys.");
    const result = await response.json() as { passkeys: Passkey[] };
    setKeys(result.passkeys);
  }

  useEffect(() => { void refresh().catch(() => setMessage("Could not load passkeys.")); }, []);

  async function add() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/passkey/register/options", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      const options = await response.json();
      if (!response.ok) throw new Error(options.error || "Could not start passkey setup.");
      const credential = await startRegistration({ optionsJSON: options });
      const verify = await fetch("/api/passkey/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(credential) });
      if (!verify.ok) throw new Error("Passkey registration failed.");
      await refresh(); setMessage("Passkey added. You can now unlock this app with your device.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Passkey registration failed."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/passkey/remove", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error("Could not remove passkey.");
      await refresh(); setMessage("Passkey removed.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not remove passkey."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen p-6 max-w-xl mx-auto space-y-6">
    <a href="/" className="underline">Back to app</a>
    <h1 className="text-2xl font-bold">Device sign-in</h1>
    <p>Sign in with a passkey using your phone’s fingerprint, face unlock, or device passcode. Your device chooses the unlock method. Add a passkey on each device you want to use.</p>
    <button type="button" className="rounded border px-4 py-2" disabled={busy || typeof window === "undefined" || !("PublicKeyCredential" in window)} onClick={add}>Add a passkey on this device</button>
    {message && <p role="status">{message}</p>}
    <h2 className="text-lg font-semibold">Registered passkeys</h2>
    {keys.length === 0 ? <p>No passkeys yet.</p> : <ul className="space-y-3">{keys.map(key => <li key={key.id} className="flex justify-between gap-4 rounded border p-3"><span>Added {new Date(key.createdAt).toLocaleDateString()}{key.lastUsedAt ? ` · Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : ""}</span><button type="button" disabled={busy} onClick={() => remove(key.id)} className="underline">Remove</button></li>)}</ul>}
  </main>;
}
