"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const API_BASE = "/api/auth";
const ROOM_API_BASE = "/api/rooms";

const features = [
  {
    title: "Fast sign in",
    description:
      "Sign in or sign up, then keep moving without losing your place.",
  },
  {
    title: "Room access",
    description:
      "Create a room and jump straight into the canvas in one flow.",
  },
  {
    title: "Clear feedback",
    description:
      "See clear success and error states so you always know what happened.",
  },
];

type AuthMode = "signin" | "signup";

type SessionState = {
  token: string;
  userId?: string;
};

type ApiResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; message: string };

type RoomLookupResponse = {
  room: {
    id: number;
    slug: string;
    adminId: string;
    createdAt: string;
  } | null;
};

async function readJson<T = Record<string, unknown>>(
  response: Response
): Promise<ApiResult<T>> {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return {
      ok: true,
      data: (payload ?? {}) as T,
    };
  }

  const message =
    payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "Request failed")
      : "Request failed";

  return {
    ok: false,
    message,
  };
}

export default function Home() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [joinRoomSlug, setJoinRoomSlug] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState("Ready when you are.");
  const [error, setError] = useState("");
  const [roomStatus, setRoomStatus] = useState("");
  const [joinStatus, setJoinStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("sketchsync-token");
    const storedUserId = window.localStorage.getItem("sketchsync-user-id");

      if (storedToken) {
        setSession({
          token: storedToken,
          userId: storedUserId ?? undefined,
        });
      setStatus("Restored your session.");
    }
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus(mode === "signup" ? "Creating account..." : "Signing in...");
    setIsSubmitting(true);

    try {
      const payload =
        mode === "signup"
          ? { name, username, password }
          : { username, password };

      const response = await fetch(`${API_BASE}/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await readJson<{ token?: string; userId?: string }>(response);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (mode === "signup") {
        setStatus("Account created. You can sign in with the same credentials.");
        setMode("signin");
        setPassword("");
        return;
      }

      const token = result.data.token;
      if (!token) {
        setError("Sign in did not return a token.");
        return;
      }

      const nextSession = {
        token,
        userId: result.data.userId,
      };

      setSession(nextSession);
      window.localStorage.setItem("sketchsync-token", token);
      if (nextSession.userId) {
        window.localStorage.setItem("sketchsync-user-id", nextSession.userId);
      } else {
        window.localStorage.removeItem("sketchsync-user-id");
      }
      setStatus("Signed in successfully.");
      setPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while signing in."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.token) {
      setError("Sign in first to create a room.");
      return;
    }

    const slug = createRoomName.trim();
    if (!slug) {
      setError("Enter a room slug to create.");
      return;
    }

    setRoomStatus("Creating room...");
    setError("");
    setIsCreatingRoom(true);

    try {
      const response = await fetch("/api/room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ name: slug }),
      });

      const result = await readJson<{ roomId?: number }>(response);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (!result.data.roomId) {
        setRoomStatus("Room created, but no room id was returned.");
        return;
      }

      setRoomStatus(`Room created successfully. Room ID: ${result.data.roomId}`);
      setCreateRoomName("");
      startTransition(() => {
        router.push(`/rooms/${encodeURIComponent(slug)}`);
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create the room right now."
      );
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = joinRoomSlug.trim();

    if (!slug) {
      setError("Enter a room slug to join.");
      return;
    }

    setJoinStatus("Looking up room...");
    setError("");
    setIsJoiningRoom(true);

    try {
      const response = await fetch(`${ROOM_API_BASE}/${encodeURIComponent(slug)}`, {
        method: "GET",
      });

      const result = await readJson<RoomLookupResponse>(response);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const room = result.data.room;

      if (!room) {
        setJoinStatus("No room found for that slug.");
        return;
      }

      setJoinStatus(`Joined ${room.slug}.`);
      setJoinRoomSlug("");
      startTransition(() => {
        router.push(`/rooms/${encodeURIComponent(room.slug)}`);
      });
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Unable to join the room right now."
      );
    } finally {
      setIsJoiningRoom(false);
    }
  }

  function handleSignOut() {
    window.localStorage.removeItem("sketchsync-token");
    window.localStorage.removeItem("sketchsync-user-id");
    setSession(null);
    setRoomStatus("");
    setStatus("Signed out.");
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />
      <div className={styles.gridNoise} />

      <header className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>S</span>
          <span>SketchSync</span>
        </Link>

        <nav className={styles.navLinks} aria-label="Primary">
          <a href="#auth">Auth</a>
          <a href="#rooms">Rooms</a>
          <a href="#features">Why it works</a>
        </nav>

        <div className={styles.navActions}>
          {session ? (
            <button className={styles.navCta} type="button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <a className={styles.navCta} href="#auth">
              Open auth
            </a>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Sketching, simplified</p>
          <h1>Sign in, create a room, and keep drawing.</h1>
          <p className={styles.subcopy}>
            Sign in once, create a room, and keep your focus on the canvas. The
            whole flow is built to feel quick, clear, and out of the way.
          </p>

          <div className={styles.actions}>
            <a className={styles.primaryAction} href="#auth">
              Open auth panel
            </a>
            <a className={styles.secondaryAction} href="#rooms">
              Create a room
            </a>
          </div>

          <div className={styles.metrics} aria-label="Quick actions">
            <div>
              <strong>Create account</strong>
              <span>set up a new workspace identity</span>
            </div>
            <div>
              <strong>Quick sign in</strong>
              <span>get back into your workspace fast</span>
            </div>
            <div>
              <strong>Private room</strong>
              <span>launch a focused sketching space</span>
            </div>
          </div>
        </div>

        <div className={styles.heroPanel} id="auth" aria-label="Quick setup panel">
          <div className={styles.panelTop}>
            <span className={styles.windowDots}>
              <i />
              <i />
              <i />
            </span>
            <span>{session ? "Signed in" : "Open auth"}</span>
            <span className={styles.panelBadge}>{session ? "Live" : "Idle"}</span>
          </div>

          <div className={styles.authTabs} role="tablist" aria-label="Sign in mode">
            <button
              type="button"
              className={mode === "signin" ? styles.authTabActive : styles.authTab}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? styles.authTabActive : styles.authTab}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          <form className={styles.authForm} onSubmit={handleAuthSubmit}>
            {mode === "signup" ? (
              <label className={styles.field}>
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                />
              </label>
            ) : null}

            <label className={styles.field}>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ada"
                autoComplete="username"
                minLength={3}
                maxLength={20}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                type="password"
                required
              />
            </label>

            <button className={styles.formButton} type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === "signup"
                  ? "Creating account..."
                  : "Signing in..."
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className={styles.panelFooter}>
            <div>
              <span className={styles.panelLabel}>Status</span>
              <strong>{session ? "Connected" : status}</strong>
            </div>
            <span className={session ? styles.tokenPill : styles.tokenPillMuted}>
              {session ? "Active" : "Not connected"}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.featureSection} id="features">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Why it feels good</p>
          <h2>The UI stays simple, fast, and focused on the work.</h2>
        </div>

        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <article className={styles.featureCard} key={feature.title}>
              <span className={styles.featureIndex}>0{index + 1}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection} id="rooms">
        <div className={styles.workflowCopy}>
          <p className={styles.kicker}>Rooms</p>
          <h2>Create a room or join an existing one in one quick step.</h2>
        </div>

        <div className={styles.roomsPanel}>
          <form className={styles.roomForm} onSubmit={handleCreateRoom}>
            <div className={styles.roomCardHeader}>
              <div>
                <span className={styles.panelLabel}>Create room</span>
                <strong>Start a fresh space for your team.</strong>
              </div>
              <span className={styles.roomPill}>{session ? "Ready" : "Sign in first"}</span>
            </div>

            <label className={styles.field}>
              <span>Room slug</span>
              <input
                value={createRoomName}
                onChange={(event) => setCreateRoomName(event.target.value)}
                placeholder="design-crit"
                minLength={3}
                maxLength={20}
                required
              />
            </label>

            <button
              className={styles.formButton}
              type="submit"
              disabled={!session || isCreatingRoom || isNavigating}
            >
              {isCreatingRoom ? "Creating room..." : "Create and open"}
            </button>

            <p className={styles.roomHint}>
              Your new room opens immediately after creation.
            </p>
          </form>

          <form className={styles.roomForm} onSubmit={handleJoinRoom}>
            <div className={styles.roomCardHeader}>
              <div>
                <span className={styles.panelLabel}>Join room</span>
                <strong>Open an existing room by slug.</strong>
              </div>
              <span className={styles.roomPillSoft}>Public lookup</span>
            </div>

            <label className={styles.field}>
              <span>Room slug</span>
              <input
                value={joinRoomSlug}
                onChange={(event) => setJoinRoomSlug(event.target.value)}
                placeholder="design-crit"
                minLength={3}
                maxLength={20}
                required
              />
            </label>

            <button
              className={styles.formButton}
              type="submit"
              disabled={isJoiningRoom || isNavigating}
            >
              {isJoiningRoom ? "Finding room..." : "Join room"}
            </button>

            <p className={styles.roomHint}>
              Enter a room slug to jump straight into an existing space.
            </p>
          </form>

          <div className={styles.roomStatusPanel}>
            <span className={styles.panelLabel}>Room status</span>
            <strong>{roomStatus || joinStatus || "No room selected yet."}</strong>
            <p>
              {session
                ? "You’re signed in and ready to create rooms."
                : "Join is open; create still needs a signed-in session."}
            </p>
          </div>
        </div>
      </section>

      {error ? <p className={styles.toastError}>{error}</p> : null}
    </main>
  );
}
