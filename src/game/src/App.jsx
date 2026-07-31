import { useEffect, useState } from "react";
import AuthGate from "./components/AuthGate.jsx";
import RealLifeXP from "./game/RealLifeXP.jsx";
import {
  storage,
  localStorageWorks,
  reconcileOnSignIn,
  clearUser,
} from "./lib/storage.js";
import { upsertProfile } from "./lib/supabase.js";

/* The game reads and writes through window.storage — same contract as the
   old single-file build, so the game code itself is unchanged. Here that
   contract is backed by the offline-first sync layer instead of raw
   localStorage. */
if (typeof window !== "undefined") {
  window.storage = storage;
}

export default function App() {
  return (
    <AuthGate>
      {({ user }) => <GameHost user={user} />}
    </AuthGate>
  );
}

function GameHost({ user }) {
  const [ready, setReady] = useState(false);
  const [storageOk] = useState(() => localStorageWorks());

  useEffect(() => {
    let alive = true;
    (async () => {
      if (user?.id) {
        await reconcileOnSignIn(user.id);
      } else {
        clearUser();
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  /* Keep a lightweight public profile in step, so leaderboards and friend
     lists can exist later without exposing anyone's full save. */
  useEffect(() => {
    if (!user?.id || !ready) return;
    const t = setTimeout(async () => {
      try {
        const raw = window.localStorage.getItem("rlxp-state-v1");
        if (!raw) return;
        const s = JSON.parse(raw);
        await upsertProfile(user.id, {
          display_name: s?.settings?.displayName ?? null,
          total_xp: Number(s?.totalXp) || 0,
          longest_streak: Number(s?.longestStreak) || 0,
        });
      } catch (e) {
        /* best effort */
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [user?.id, ready]);

  if (!ready) return <div className="rlxp-auth-boot" />;
  return <RealLifeXP storageOk={storageOk} user={user} />;
}
