import { useEffect, useState } from "react";
import {
  cloudConfigured,
  getSession,
  onAuthChange,
  signIn,
  signUp,
  sendPasswordReset,
} from "../lib/supabase.js";

/* =======================================================================
   AuthGate

   Wraps the game. Its job is to establish who (if anyone) is signed in,
   then hand that down. Deliberately never blocks play: "Continue without
   an account" is always available, because someone standing in a gym with
   no signal must still be able to log a set. Signing in later uploads
   whatever they did offline.
   ======================================================================= */
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(
    () => !cloudConfigured || window.localStorage.getItem("rlxp-play-offline") === "1"
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession();
      if (alive) {
        setSession(s);
        setChecking(false);
      }
    })();
    const off = onAuthChange((s) => {
      setSession(s);
      if (s) {
        try {
          window.localStorage.removeItem("rlxp-play-offline");
        } catch (e) {
          /* ignore */
        }
        setOffline(false);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (checking && cloudConfigured) {
    return <div className="rlxp-auth-boot" />;
  }

  if (!session && !offline) {
    return (
      <AuthScreen
        onOffline={() => {
          try {
            window.localStorage.setItem("rlxp-play-offline", "1");
          } catch (e) {
            /* ignore */
          }
          setOffline(true);
        }}
      />
    );
  }

  return children({ session, user: session?.user ?? null });
}

function AuthScreen({ onOffline }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit() {
    setError("");
    setNotice("");
    if (!email.trim()) return setError("Enter your email address.");
    if (mode !== "reset" && password.length < 8)
      return setError("Password needs to be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "signup") {
        const res = await signUp(email, password, name);
        if (!res?.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        await sendPasswordReset(email);
        setNotice("Password reset link sent. Check your email.");
        setMode("signin");
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rlxp-auth">
      <div className="rlxp-auth-card">
        <div className="rlxp-auth-title">REAL-LIFE XP</div>
        <div className="rlxp-auth-sub">
          {mode === "signup"
            ? "Create an account and your progress follows you to any device."
            : mode === "reset"
            ? "We'll email you a link to set a new password."
            : "Sign in to pick up where you left off."}
        </div>

        {mode === "signup" && (
          <label className="rlxp-auth-field">
            <span>Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              placeholder="What should we call you?"
            />
          </label>
        )}

        <label className="rlxp-auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck="false"
          />
        </label>

        {mode !== "reset" && (
          <label className="rlxp-auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
        )}

        {error && <div className="rlxp-auth-error">{error}</div>}
        {notice && <div className="rlxp-auth-notice">{notice}</div>}

        <button className="rlxp-auth-primary" onClick={handleSubmit} disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "signin"
            ? "Sign in"
            : mode === "signup"
            ? "Create account"
            : "Send reset link"}
        </button>

        <div className="rlxp-auth-links">
          {mode === "signin" && (
            <>
              <button onClick={() => setMode("signup")}>Create an account</button>
              <button onClick={() => setMode("reset")}>Forgot password</button>
            </>
          )}
          {mode !== "signin" && <button onClick={() => setMode("signin")}>Back to sign in</button>}
        </div>

        <div className="rlxp-auth-divider" />

        <button className="rlxp-auth-offline" onClick={onOffline}>
          Continue without an account
        </button>
        <div className="rlxp-auth-footnote">
          Your progress stays on this device only. You can sign in later and it
          will be uploaded.
        </div>
      </div>
    </div>
  );
}

function friendlyError(e) {
  const msg = String(e?.message || e || "");
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match.";
  if (/already registered/i.test(msg)) return "That email already has an account. Try signing in.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  if (/network|fetch/i.test(msg))
    return "Can't reach the server. Check your connection, or continue without an account.";
  if (/aren't set up/i.test(msg)) return msg;
  return msg || "Something went wrong. Try again.";
}
