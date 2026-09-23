/**
 * Sets new passwords on the three fixed test accounts. The passwords come
 * from the environment, never from this file. Run once, by hand:
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/rotate-test-account-passwords.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 12;

const TEST_ACCOUNTS = [
  { email: "admin@weatherwell.com", envVar: "TEST_ADMIN_PASSWORD" },
  { email: "official@weatherwell.com", envVar: "TEST_OFFICIAL_PASSWORD" },
  { email: "user@weatherwell.com", envVar: "TEST_USER_PASSWORD" },
] as const;

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

async function main() {
  const read = readTestPasswords(process.env);
  if (!read.ok) {
    console.error(read.error);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  let failed = false;
  for (const { email, password } of read.passwords) {
    const id = await findUserId(admin, email);
    if (!id) {
      console.error(`No account for ${email}`);
      failed = true;
      continue;
    }
    const { error } = await admin.updateUserById(id, { password });
    if (error) {
      console.error(`Failed to update ${email}: ${error.message}`);
      failed = true;
    } else {
      console.log(`Updated ${email}`);
    }
  }

  if (failed) process.exit(1);
}

// Only run when executed directly, so importing this in a test is side-effect free.
if (process.argv[1]?.endsWith("rotate-test-account-passwords.ts")) {
  void main();
}
