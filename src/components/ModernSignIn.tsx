import { startAuthentication } from "@simplewebauthn/browser";
import { useEffect, useRef, useState } from "react";

type GoogleAccounts = {
  id: {
    initialize(options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }): void;
    renderButton(element: HTMLElement, options: { theme: string; size: string; width: number }): void;
  };
};

declare global { interface Window { google?: { accounts: GoogleAccounts } } }

type SignInOptions = { googleClientId: string | null; googleNonce: string | null };
let signInOptionsPromise: Promise<SignInOptions> | undefined;
function loadSignInOptions() {
  return signInOptionsPromise ??= fetch("/api/signin/options", { credentials: "same-origin" })
    .then(async response => {
      if (!response.ok) throw new Error("Sign-in options are unavailable.");
      return response.json() as Promise<SignInOptions>;
    })
    .catch(error => { signInOptionsPromise = undefined; throw error; });
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "same-origin", body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || "Sign-in failed.");
  return result;
}

let googleScriptPromise: Promise<void> | undefined;
function googleScript() {
  if (window.google) return Promise.resolve();
  return googleScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { googleScriptPromise = undefined; reject(new Error("Google sign-in could not load.")); };
    document.head.appendChild(script);
  });
}

export function ModernSignIn({ afterSignIn = "/" }: { afterSignIn?: string }) {
  const googleButton = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function setup() {
      try {
        const config = await loadSignInOptions();
        if (!config.googleClientId || !config.googleNonce) return;
        await googleScript();
        if (!active || !window.google || !googleButton.current) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          nonce: config.googleNonce,
          callback: async ({ credential }) => {
            setBusy(true);
            setError("");
            try {
              await post("/api/signin/google", { credential });
              window.location.assign(afterSignIn);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Google sign-in failed.");
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButton.current, { theme: "outline", size: "large", width: 300 });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Google sign-in is unavailable.");
      }
    }
    void setup();
    return () => { active = false; };
  }, [afterSignIn]);

  async function withPasskey() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/passkey/login/options", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      const options = await response.json();
      if (!response.ok) throw new Error(options.error || "Passkey is unavailable.");
      const credential = await startAuthentication({ optionsJSON: options });
      await post("/api/passkey/login/verify", credential);
      window.location.assign(afterSignIn);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey sign-in failed.");
      setBusy(false);
    }
  }

  return <div className="space-y-3 pt-4 border-t">
    <div ref={googleButton} className="flex justify-center" />
    {typeof window !== "undefined" && "PublicKeyCredential" in window &&
      <button type="button" className="w-full rounded border p-2" disabled={busy} onClick={withPasskey}>
        Use fingerprint or device passcode
      </button>}
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
  </div>;
}
