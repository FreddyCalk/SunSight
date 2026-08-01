#!/usr/bin/env node
/**
 * Keep mobile/app.config.ts `version` (source of truth) and package.json in lockstep.
 *
 * Usage:
 *   node scripts/version.mjs              # assert match (CI gate)
 *   node scripts/version.mjs --bump-patch # bump patch on both files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, '..');
const APP_CONFIG_PATH = path.join(mobileRoot, 'app.config.ts');
const PACKAGE_JSON_PATH = path.join(mobileRoot, 'package.json');

/** Matches a top-level `version: 'x.y.z'` / `version: "x.y.z"` literal in app.config.ts. */
const VERSION_LITERAL_RE = /^(\s*version:\s*)(['"])(\d+\.\d+\.\d+)\2/m;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function readAppConfigVersion(source) {
  const match = source.match(VERSION_LITERAL_RE);
  if (!match) {
    throw new Error(
      "Could not find version: 'x.y.z' literal in app.config.ts (source of truth)",
    );
  }
  return match[3];
}

export function writeAppConfigVersion(source, nextVersion) {
  if (!SEMVER_RE.test(nextVersion)) {
    throw new Error(`Invalid semver: ${nextVersion}`);
  }
  if (!VERSION_LITERAL_RE.test(source)) {
    throw new Error('Could not find version literal to replace in app.config.ts');
  }
  return source.replace(VERSION_LITERAL_RE, `$1$2${nextVersion}$2`);
}

export function bumpPatch(version) {
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Invalid semver: ${version}`);
  }
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function assertPackageVersionMatches(packageVersion, appVersion) {
  if (packageVersion !== appVersion) {
    throw new Error(
      `package.json version "${packageVersion}" does not match app.config.ts version "${appVersion}"`,
    );
  }
}

export function main(argv = process.argv.slice(2), paths = {}) {
  const appConfigPath = paths.appConfigPath ?? APP_CONFIG_PATH;
  const packageJsonPath = paths.packageJsonPath ?? PACKAGE_JSON_PATH;
  const shouldBump = argv.includes('--bump-patch');

  const appConfigSource = fs.readFileSync(appConfigPath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const appVersion = readAppConfigVersion(appConfigSource);

  if (!SEMVER_RE.test(appVersion)) {
    throw new Error(`Invalid app.config.ts version: ${appVersion}`);
  }

  assertPackageVersionMatches(packageJson.version, appVersion);

  if (!shouldBump) {
    console.log(`version check ok: ${appVersion}`);
    return { version: appVersion, bumped: false };
  }

  const nextVersion = bumpPatch(appVersion);
  const nextAppConfig = writeAppConfigVersion(appConfigSource, nextVersion);
  packageJson.version = nextVersion;

  fs.writeFileSync(appConfigPath, nextAppConfig);
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`bumped ${appVersion} -> ${nextVersion}`);
  return { version: nextVersion, bumped: true, previous: appVersion };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(__filename);
  } catch {
    return path.resolve(entry) === path.resolve(__filename);
  }
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
