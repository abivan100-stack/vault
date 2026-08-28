import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const API = "http://127.0.0.1:8787";

export default function AccountPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [chatId, setChatId] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(() => window.localStorage.getItem("vault:authToken") || "");

  const submit = async () => {
    setMessage("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, organizationName };
      const response = await fetch(`${API}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      window.localStorage.setItem("vault:authToken", data.token);
      setToken(data.token);
      setMessage(`Signed in as ${data.user.email} (${data.user.role}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    }
  };

  const saveTelegram = async () => {
    try {
      const response = await fetch(`${API}/api/organizations/telegram`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ chatId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save Telegram chat");
      setMessage("Telegram chat connected for this organisation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    }
  };

  return <div className="mx-auto max-w-xl space-y-5"><header><h1 className="text-[21px] font-semibold text-ink">Account & organisation</h1><p className="mt-1 text-[13.5px] text-ink-muted">Sign in to manage organisation access and Telegram alerts.</p></header><Card render={<section />}><CardHeader><CardTitle>{mode === "login" ? "Sign in" : "Create organisation"}</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" /><Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (8+ characters)" type="password" />{mode === "register" && <Input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Organisation name" />}<Button onClick={submit} className="w-full">{mode === "login" ? "Sign in" : "Create account"}</Button><button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-[13px] text-ink-muted underline">{mode === "login" ? "Create a new organisation" : "Use an existing account"}</button></CardContent></Card>{token && <Card render={<section />}><CardHeader><CardTitle>Telegram alerts</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="Telegram chat ID" /><Button onClick={saveTelegram} variant="outline" className="w-full">Save Telegram chat</Button></CardContent></Card>}{message && <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-[13px] text-ink-muted">{message}</p>}</div>;
}
