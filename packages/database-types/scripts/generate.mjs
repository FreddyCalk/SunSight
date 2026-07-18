import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(packageRoot, "../..")
const canonicalPath = join(packageRoot, "src/database.types.ts")
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sunsight-database-types-"))
const generatedPath = join(temporaryDirectory, "database.types.ts")

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
    throw new Error(
      `Expected the repository Supabase CLI ${expectedVersion ?? "(undeclared)"}, found ${installedManifest.version}. Run npm install at the repository root.`,
    )
  }

  return join(
    dirname(installedManifestPath),
    installedManifest.bin.supabase,
  )
}

function generateTypes() {
  const supabaseCli = resolveSupabaseCli()
  const output = openSync(generatedPath, "w")
  const result = spawnSync(
    process.execPath,
    [
      supabaseCli,
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public",
      "--workdir",
      repositoryRoot,
    ],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", output, "pipe"],
    },
  )
  closeSync(output)

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const details = result.stderr.toString().trim()
    throw new Error(
      `Supabase type generation failed with exit code ${result.status}${details ? `:\n${details}` : ""}`,
    )
  }
}

function main() {
  const mode = process.argv[2]

  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: node scripts/generate.mjs --write|--check")
  }

  generateTypes()
  const generated = readFileSync(generatedPath)

  if (mode === "--write") {
    writeFileSync(canonicalPath, generated)
    console.log("Generated src/database.types.ts from the local public schema.")
    return
  }

  const canonical = readFileSync(canonicalPath)
  if (!canonical.equals(generated)) {
    console.error(
      "Database types are stale. Start local Supabase and run npm run generate.",
    )
    process.exitCode = 1
    return
  }

  console.log("Database types match the local public schema.")
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
