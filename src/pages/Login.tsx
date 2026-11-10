import { useState, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Try again later." : "Invalid email or password.");
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally { setBusy(false); }
  }
  return <div className="min-h-screen flex items-center justify-center">
    <Card className="w-full max-w-sm"><CardHeader className="text-center"><CardTitle>MERIT sign in</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-4">
        <label className="block">Email<input className="w-full rounded border p-2" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block">Password<input className="w-full rounded border p-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <Button className="w-full" size="lg" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form></CardContent></Card>
  </div>;
}
