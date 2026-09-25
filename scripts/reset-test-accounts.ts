/**
 * Replaces the test accounts: deletes the old ones, then creates (or resets)
 * the four below, already email-confirmed, each with its role. Passwords come
 * from the environment, never from this file. Run by hand:
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/reset-test-accounts.ts         # shows the plan
 *   set -a && source .env.local && set +a && npx tsx scripts/reset-test-accounts.ts --yes   # does it
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SERVICE_ROLE_KEY and the four TEST_*_PASSWORD variables.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 12;

/** Deleted with their test reports, pins, votes and check-ins; alerts and markers they made stay, unlinked. */
export const OLD_ACCOUNTS = [
  "admin@weatherwell.com",
  "official@weatherwell.com",
  "user@weatherwell.com",
  "municipalofficial@weatherwell.com",
];

type TestAccount = {
  email: string;
  envVar: string;
  role: "admin" | "operator" | "resident";
  area?: string;
  displayName?: string;
};

// Supabase stores emails in lower case; signing in is not case-sensitive.
export const TEST_ACCOUNTS: TestAccount[] = [
  { email: "admintest@weatherwell.com", envVar: "TEST_ADMIN_PASSWORD", role: "admin", displayName: "Test Admin" },
  {
    email: "brgy.nilombottest@weatherwell.com",
    envVar: "TEST_BARANGAY_PASSWORD",
    role: "operator",
    area: "0105528012", // Barangay Nilombot, Mapandan
    displayName: "Test Official, Nilombot",
  },
  { email: "usertest@weatherwell.com", envVar: "TEST_USER_PASSWORD", role: "resident" },
  {
    email: "mun.mapandantest@weatherwell.com",
    envVar: "TEST_MUNICIPAL_PASSWORD",
    role: "operator",
    area: "0105528", // Mapandan
    displayName: "Test Official, Mapandan",
  },
];

export type ReadResult =
  | { ok: true; passwords: { email: string; password: string }[] }
  | { ok: false; error: string };

export function readTestPasswords(env: Record<string, string | undefined>): ReadResult {
  const problems: string[] = [];
  const passwords: { email: string; password: string }[] = [];

  for (const { email, envVar } of TEST_ACCOUNTS) {
    const value = env[envVar];
    if (!value) {
      problems.push(`${envVar} is not set`);
    } else if (value.length < MIN_PASSWORD_LENGTH) {
      problems.push(`${envVar} is shorter than ${MIN_PASSWORD_LENGTH} characters`);
    } else {
      passwords.push({ email, password: value });
    }
  }

  return problems.length > 0 ? { ok: false, error: problems.join("; ") } : { ok: true, passwords };
}

type AdminApi = SupabaseClient["auth"]["admin"];

async function findUserId(admin: AdminApi, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

/** Removes what points at the account, then the account (its profile and push addresses go with it). */
async function deleteAccount(service: SupabaseClient, id: string): Promise<void> {
  const steps = [
    () => service.from("pin_votes").delete().eq("voter_id", id),
    // Other people's votes on these pins go with them (on delete cascade).
    () => service.from("community_pins").delete().eq("author_id", id),
    () => service.from("water_level_reports").delete().eq("reporter_id", id),
    () => service.from("evacuation_check_ins").delete().eq("user_id", id),
    () => service.from("alerts").update({ issued_by: null }).eq("issued_by", id),
    () => service.from("official_markers").update({ placed_by: null }).eq("placed_by", id),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) throw error;
  }
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) throw error;
}

async function createOrReset(admin: AdminApi, email: string, password: string): Promise<string> {
  const existing = await findUserId(admin, email);
  if (existing) {
    const { error } = await admin.updateUserById(existing, { password, email_confirm: true });
    if (error) throw error;
    return existing;
  }
  const { data, error } = await admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`No user returned for ${email}`);
  return data.user.id;
}

async function main() {
  const read = readTestPasswords(process.env);
  if (!read.ok) {
    console.error(read.error);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceRoleKey || !publishableKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  if (!process.argv.includes("--yes")) {
    console.log("Would delete (with their test reports, pins, votes and check-ins):");
    for (const email of OLD_ACCOUNTS) console.log(`  ${email}`);
    console.log("Would create or reset:");
    for (const account of TEST_ACCOUNTS) console.log(`  ${account.email} (${account.role}${account.area ? `, ${account.area}` : ""})`);
    console.log("Run again with --yes to do it. Deleting cannot be undone.");
    return;
  }

  const service = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const email of OLD_ACCOUNTS) {
    const id = await findUserId(service.auth.admin, email);
    if (!id) {
      console.log(`Already gone: ${email}`);
      continue;
    }
    await deleteAccount(service, id);
    console.log(`Deleted ${email}`);
  }

  const ids = new Map<string, string>();
  for (const { email, password } of read.passwords) {
    ids.set(email, await createOrReset(service.auth.admin, email, password));
    console.log(`Ready: ${email}`);
  }

  // Roles. The admin and the resident are set directly; officials are
  // appointed by the new admin, so the action record shows it.
  const admin = TEST_ACCOUNTS.find((account) => account.role === "admin")!;
  for (const account of TEST_ACCOUNTS.filter((a) => a.role !== "operator")) {
    const { error } = await service
      .from("profiles")
      .update(
        account.role === "admin"
          ? { role: "admin", area_code: null, display_name: account.displayName }
          : { role: "resident", area_code: null, display_name: null }
      )
      .eq("id", ids.get(account.email)!);
    if (error) throw error;
    console.log(`${account.email}: ${account.role}`);
  }

  const asAdmin = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminPassword = read.passwords.find((p) => p.email === admin.email)!.password;
  const { error: signInError } = await asAdmin.auth.signInWithPassword({ email: admin.email, password: adminPassword });
  if (signInError) throw signInError;
  for (const account of TEST_ACCOUNTS.filter((a) => a.role === "operator")) {
    const { error } = await asAdmin.rpc("admin_appoint_official", {
      p_email: account.email,
      p_area: account.area!,
      p_display_name: account.displayName!,
    });
    if (error) throw error;
    console.log(`${account.email}: official for ${account.area}`);
  }
  await asAdmin.auth.signOut();
}

// Only run when executed directly, so importing this in a test is side-effect free.
if (process.argv[1]?.endsWith("reset-test-accounts.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
