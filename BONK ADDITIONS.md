You are implementing multi-user support so a second user (my wife)
can use this app with fully isolated data. Work through each item
in order. Do not skip steps. Check off each item as you complete it.

---

## PHASE 1 — Supabase Auth

- [ ] Enable email/password authentication in the Supabase project
      (supabase/config.toml or dashboard — add to config if using
      local dev)

- [ ] Create src/lib/auth.ts exporting:
        signIn(email, password)
        signOut()
        getSession()
        useAuthUser() — reactive hook returning current User | null

- [ ] Create src/components/LoginScreen.tsx — minimal email +
      password form, calls signIn(), shows error on failure.
      Style matches existing zinc-900 / amber accent design system.

- [ ] Wrap the app root (App.tsx or main.tsx) so:
        - If no session → render <LoginScreen />
        - If session exists → render the existing app
      Use useAuthUser() to drive this conditional.

- [ ] Add a sign-out button to the app (settings area or header).

---

## PHASE 2 — Add user_id to all tables

- [ ] Create a migration file in supabase/migrations/ that adds a
      nullable user_id uuid column (referencing auth.users) to every
      table that holds per-user data. Tables to migrate:
        session_logs, set_logs, readiness_logs, sleep_logs,
        stress_logs, nutrition_logs, hydration_logs, bodyweight_logs,
        body_measurement_logs, body_readiness_logs, mindfulness_logs,
        cardio_logs, hrv_logs, workday_logs, supplement_logs,
        injury_episodes, templates, prescriptions, lifts

      SQL pattern per table:
        ALTER TABLE session_logs
          ADD COLUMN IF NOT EXISTS user_id uuid
          REFERENCES auth.users(id);

- [ ] In the same migration, backfill existing rows with your own
      user_id so your data is not orphaned:
        UPDATE session_logs
        SET user_id = '<YOUR_AUTH_USER_ID>'
        WHERE user_id IS NULL;
      (Repeat for every table above.)

- [ ] After backfill, add NOT NULL constraint to user_id on all
      tables:
        ALTER TABLE session_logs
          ALTER COLUMN user_id SET NOT NULL;

---

## PHASE 3 — Row Level Security

- [ ] In the same migration (or a follow-on migration), enable RLS
      and create read/write policies on every table listed in Phase 2.
      Pattern:
        ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "user_isolation" ON session_logs
          FOR ALL
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      Repeat for all tables.

- [ ] Verify in Supabase dashboard that RLS is active and policies
      appear on every table before proceeding.

---

## PHASE 4 — Scope Dexie per user

- [ ] In src/lib/db.ts, change the WorkoutDb instantiation from a
      fixed database name to a user-scoped name:
        export function getDb(userId: string): WorkoutDb {
          return new WorkoutDb(`workout-${userId}`);
        }
      Replace all direct `new WorkoutDb()` calls with getDb(userId).

- [ ] Thread userId from useAuthUser() down to wherever getDb() is
      called. If db is a module-level singleton, convert it to be
      initialised after auth resolves and re-initialised on user
      change.

- [ ] Verify that signing out and signing in as a different user
      results in a completely separate local IndexedDB database
      (check Application → IndexedDB in browser devtools).

---

## PHASE 5 — Attach user_id to all writes

- [ ] Find the sync layer (src/lib/sync.ts or equivalent) where
      local rows are upserted to Supabase. Add user_id: session.user.id
      to every upsert payload.

- [ ] Find every localUpsert / db.table.put() call that writes a new
      row and ensure user_id is included in the row object before it
      is written locally. The Supabase upsert will also need it for
      RLS to pass.

- [ ] Confirm that all read queries from Supabase (initial sync /
      pull) now automatically return only the current user's rows
      because RLS filters them server-side.

---

## PHASE 6 — Feature flags for simplified mode

- [ ] Add a profiles table in Supabase:
        CREATE TABLE profiles (
          id uuid PRIMARY KEY REFERENCES auth.users(id),
          display_name text,
          mode text NOT NULL DEFAULT 'standard'
            CHECK (mode IN ('standard', 'advanced'))
        );
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "user_isolation" ON profiles
          FOR ALL USING (auth.uid() = id)
          WITH CHECK (auth.uid() = id);

- [ ] Insert a row for your account with mode = 'advanced' and for
      your wife's account with mode = 'standard'.

- [ ] Create src/lib/profile.ts exporting:
        useProfile() — fetches the profile row for the current user
        isAdvanced() — returns profile.mode === 'advanced'

- [ ] In the app, gate the following behind isAdvanced():
        - mesoAnalysis / liftRecommendations tab
        - prescriptionDivergence display
        - HRV entry and HRV tab in History
        - Export JSON button
        - Any meso configuration UI
      Standard mode users see Today, History (Goals only), and
      Recovery tabs only.

---

## PHASE 7 — Seed her data

- [ ] Write a seed script (scripts/seed-user.ts or a SQL file) that
      inserts a starter lift library, templates, and prescriptions
      scoped to her user_id. Run it after her account is created.
      Do not modify or touch the existing seed data for your account.

---

## PHASE 8 — Export pipeline user-scoping

- [ ] In exportLocalDump.ts, verify that all data reads go through
      the user-scoped Dexie instance (getDb(userId)) and not a
      shared instance. If Dexie is already namespaced per user from
      Phase 4, this likely works automatically — add a comment
      confirming this.

---

## VERIFICATION CHECKLIST

- [ ] Sign in as yourself — all your existing data is present
- [ ] Sign in as wife — empty state, no data visible from your account
- [ ] Log a session as wife — does not appear in your account
- [ ] Supabase table viewer confirms rows have correct user_id values
- [ ] Signing out clears the UI and returns to LoginScreen
- [ ] IndexedDB in devtools shows two separate databases
      (workout-<your-id> and workout-<her-id>)