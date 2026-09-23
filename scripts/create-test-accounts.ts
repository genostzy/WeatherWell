/**
 * Creates the three fixed test accounts for the admin/official/user role
 * tiers, in the LIVE project this script's env vars point at. Run once,
 * by hand: `npx tsx scripts/create-test-accounts.ts`. Not part of any
 * build step or CI job — re-running it is safe (each createUser call for
 * an email that already exists fails loudly, logged and skipped, rather
 * than silently overwriting anything) but pointless once it has succeeded.
 *
 * Uses the Admin API (auth.admin.createUser with email_confirm: true)
 * rather than inserting into auth.users directly — a raw SQL insert would
 * need to reproduce GoTrue's exact password-hash format and its
 * auth.identities row by hand, which Supabase's own guidance says not to
 * do (see the design spec this script implements, Task 7's "how the 3
 * test accounts are created" decision).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Account {
  email: string;
  password: string;
  role: "admin" | "operator" | "resident";
  displayName?: string;
  area?: string;
}

const ACCOUNTS: Account[] = [
  { email: "admin@weatherwell.com", password: "<redacted>", role: "admin", displayName: "Test Admin" },
  {
    email: "official@weatherwell.com",
    password: "<redacted>",
    role: "operator",
    displayName: "Test Official",
    area: "Barangay Nilombot, Mapandan",
  },
  { email: "user@weatherwell.com", password: "<redacted>", role: "resident" },
];

async function main() {
  for (const account of ACCOUNTS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error) {
      console.error(`Failed to create ${account.email}: ${error.message}`);
      continue;
    }
    const userId = data.user.id;
    console.log(`Created ${account.email} (${userId})`);

    if (account.role === "resident") continue;

    if (account.role === "admin") {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "admin", display_name: account.displayName })
        .eq("id", userId);
      if (profileError) console.error(`Failed to set admin role for ${account.email}: ${profileError.message}`);
      else console.log(`  -> role=admin, display_name=${account.displayName}`);
      continue;
    }

    // operator: go through appoint_official's underlying logic by calling
    // the same function the SQL editor would — this service-role client
    // can, since it runs as postgres for RPC calls the same way every
    // other privileged script-side write in this codebase does. Using
    // appoint_official (not a raw profiles update) means this script gets
    // the exact same area-name parsing and coverage report a real
    // appointment would.
    const { data: result, error: appointError } = await supabase.rpc("appoint_official", {
      p_email: account.email,
      p_area: account.area!,
      p_display_name: account.displayName!,
    });
    if (appointError) console.error(`Failed to appoint ${account.email}: ${appointError.message}`);
    else console.log(`  -> ${result}`);
  }
}

main();
