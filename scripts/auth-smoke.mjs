/**
 * Local Auth smoke test for Sunsight passwordless SMS OTP.
 *
 * Requires: running local Supabase stack (`npx supabase start`) and Twilio
 * env var names present for start (placeholders OK). Uses auth.sms.test_otp
 * (+12025550100 -> 123456). Never run against staging or production.
 */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TEST_PHONE = "+12025550100"
const TEST_OTP = "123456"
const PRIVACY_POLICY_VERSION = "2026-07-17"

function fail(message) {
  console.error(`auth:smoke failed: ${message}`)
  process.exit(1)
}

function resolveSupabaseCli() {
  const rootManifest = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  )
  const installedManifestPath = join(
    repositoryRoot,
    "node_modules/supabase/package.json",
  )
  const installedManifest = JSON.parse(readFileSync(installedManifestPath, "utf8"))
  const expectedVersion = rootManifest.devDependencies?.supabase

  if (!expectedVersion || installedManifest.version !== expectedVersion) {
    fail(
      `expected Supabase CLI ${expectedVersion ?? "(undeclared)"}, found ${installedManifest.version}. Run npm install at the repository root.`,
    )
  }

  return join(dirname(installedManifestPath), installedManifest.bin.supabase)
}

function parseStatusEnv(text) {
  const vars = {}

  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/)
    if (match) {
      vars[match[1]] = match[2]
    }
  }

  return vars
}

function readLocalStackEnv() {
  const supabaseCli = resolveSupabaseCli()
  const result = spawnSync(
    process.execPath,
    [supabaseCli, "status", "-o", "env", "--workdir", repositoryRoot],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  )

  if (result.error) {
    fail(result.error.message)
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()

  if (result.status !== 0) {
    fail(
      output.includes("is not running")
        ? "local Supabase stack is not running. Start it with: npx supabase start"
        : `supabase status failed (exit ${result.status})${output ? `:\n${output}` : ""}`,
    )
  }

  const env = parseStatusEnv(result.stdout ?? "")
  const apiUrl = env.API_URL ?? env.SUPABASE_URL
  const anonKey = env.ANON_KEY

  if (!apiUrl || !anonKey) {
    fail(
      "could not resolve API_URL and ANON_KEY from `supabase status -o env`. Is the local stack running?",
    )
  }

  let parsedUrl
  try {
    parsedUrl = new URL(apiUrl)
  } catch {
    fail(`invalid API URL from supabase status: ${apiUrl}`)
  }

  const host = parsedUrl.hostname
  if (host !== "127.0.0.1" && host !== "localhost") {
    fail(
      `refusing to run against non-local API URL (${apiUrl}). This script is local-only.`,
    )
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    anonKey,
    dbUrl: env.DB_URL,
  }
}

async function authFetch(apiUrl, anonKey, path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let payload

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? payload.msg ?? payload.message ?? payload.error_description ?? JSON.stringify(payload)
        : String(payload)
    fail(`${path} returned HTTP ${response.status}: ${detail}`)
  }

  return payload
}

function isPhoneHmacSecretProvisioned(dbUrl) {
  if (!dbUrl) {
    return null
  }

  const sql =
    "select exists(select 1 from vault.decrypted_secrets where name = 'PHONE_HMAC_SECRET' and octet_length(decrypted_secret) >= 32)"

  const result = spawnSync("psql", [dbUrl, "-tAc", sql], {
    encoding: "utf8",
  })

  if (result.error?.code === "ENOENT") {
    return null
  }

  if (result.status !== 0) {
    const detail = (result.stderr ?? result.stdout ?? "").trim()
    console.warn(
      `auth:smoke warning: could not inspect Vault for PHONE_HMAC_SECRET${detail ? `: ${detail}` : ""}`,
    )
    return null
  }

  return result.stdout.trim() === "t"
}

async function finalizeVerifiedProfile(apiUrl, anonKey, accessToken) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/finalize_verified_profile`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      p_privacy_policy_version: PRIVACY_POLICY_VERSION,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    fail(
      `finalize_verified_profile returned HTTP ${response.status}${text ? `: ${text}` : ""}`,
    )
  }
}

async function main() {
  const { apiUrl, anonKey, dbUrl } = readLocalStackEnv()

  console.log(`auth:smoke using ${apiUrl} with test_otp ${TEST_PHONE}`)

  await authFetch(apiUrl, anonKey, "/auth/v1/otp", { phone: TEST_PHONE })

  const session = await authFetch(apiUrl, anonKey, "/auth/v1/verify", {
    phone: TEST_PHONE,
    token: TEST_OTP,
    type: "sms",
  })

  if (!session?.access_token || !session?.refresh_token) {
    fail("verify response is missing access_token or refresh_token")
  }

  console.log("auth:smoke session established (access_token and refresh_token present)")

  const hmacProvisioned = isPhoneHmacSecretProvisioned(dbUrl)

  if (hmacProvisioned === true) {
    await finalizeVerifiedProfile(apiUrl, anonKey, session.access_token)
    console.log(
      `auth:smoke finalize_verified_profile succeeded (policy ${PRIVACY_POLICY_VERSION})`,
    )
  } else {
    console.log(
      "auth:smoke skipping finalize_verified_profile: PHONE_HMAC_SECRET is not provisioned in Vault (see supabase/README.md). Session proof passed.",
    )
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
