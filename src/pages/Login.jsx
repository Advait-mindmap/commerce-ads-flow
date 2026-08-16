import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(null);
  const [demoBusy, setDemoBusy] = useState(null);

  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  useEffect(() => {
    api.auth.demoUsers().then(setDemo).catch(() => setDemo({ enabled: false, users: [] }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  // One click per role: the server resolves the seeded demo account for that
  // role and issues the session, so no credentials are typed or stored here.
  const handleDemo = async (role) => {
    setError("");
    setDemoBusy(role);
    try {
      await api.auth.demoLogin(role);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Could not start the demo session");
      setDemoBusy(null);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="InSales OS"
      subtitle="Sign in to the ad sales workspace"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      {demo?.enabled && demo.users?.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Sign in as a demo role
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {demo.users.map((u) => (
              <button
                key={u.role}
                type="button"
                onClick={() => handleDemo(u.role)}
                disabled={Boolean(demoBusy)}
                className="text-left border border-border rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-accent/40 disabled:opacity-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">{u.label}</span>
                  {demoBusy === u.role ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground shrink-0">{u.full_name}</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{u.blurb}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Every demo account uses the password <span className="font-mono">{demo.password}</span> if you prefer to
            sign in manually.
          </p>
        </div>
      )}

      {demo?.enabled && demo.users?.length > 0 && (
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-3 text-muted-foreground">or sign in</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
