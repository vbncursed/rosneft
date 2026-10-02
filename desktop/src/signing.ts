import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SIGNING_CN = "Andrey Self-Signed Code Signing";

/**
 * SHA-1 of the identity named SIGNING_CN in `security find-identity` output.
 * electron-builder only looks at `find-identity -v`, which drops a self-signed
 * certificate nobody trusts; the plain listing keeps it.
 */
export function pickIdentity(findIdentityOutput: string): string | null {
  for (const line of findIdentityOutput.split("\n")) {
    const m = /\b([0-9A-F]{40})\b\s+"([^"]*)"/.exec(line);
    if (m && m[2] === SIGNING_CN) return m[1] ?? null;
  }
  return null;
}

/** The paths of `security list-keychains` output, one quoted path per line. */
export function parseKeychains(listOutput: string): string[] {
  return [...listOutput.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "").filter(Boolean);
}

type FileOptions = Record<string, unknown>;
type SignOptions = { identity?: string; keychain?: string; optionsForFile?: (file: string) => FileOptions };

const security = (...args: string[]) => execFileSync("/usr/bin/security", args, { encoding: "utf8" });

/**
 * electron-builder's `mac.sign` hook (yml: identity "-" keeps the ad-hoc path
 * alive). With ANDREY_SIGN_P12 (base64 .p12) and ANDREY_SIGN_P12_PASSWORD set it
 * imports the certificate into a throwaway keychain and signs with it. Without
 * them the options are untouched: ad-hoc, exactly as before.
 *
 * `timestamp: "none"` per file: a self-signed signature gains nothing from Apple's timestamp
 * server, and asking it once per file (~10 s each on a slow link) took minutes.
 *
 * Not CSC_LINK: the builder would also offer it to the Windows build, and its own
 * keychain import (26.15.3) unlocks the keychain with the .p12 password, which
 * is not the keychain's, so `set-key-partition-list` fails.
 */
export async function sign(opts: SignOptions): Promise<void> {
  const { signAsync } = await import("@electron/osx-sign");
  const p12 = process.env.ANDREY_SIGN_P12;
  if (!p12) return signAsync(opts as never);

  const dir = mkdtempSync(join(tmpdir(), "andrey-sign-"));
  const keychain = join(dir, "sign.keychain");
  const pass = randomBytes(24).toString("base64");
  let restore = () => {};
  try {
    writeFileSync(join(dir, "cert.p12"), Buffer.from(p12, "base64"));
    security("create-keychain", "-p", pass, keychain);
    security("unlock-keychain", "-p", pass, keychain);
    security("set-keychain-settings", keychain);
    security(
      "import",
      join(dir, "cert.p12"),
      "-k",
      keychain,
      "-T",
      "/usr/bin/codesign",
      "-P",
      process.env.ANDREY_SIGN_P12_PASSWORD ?? "",
    );
    security("set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", pass, keychain);
    // codesign looks for the identity only in the user's search list, whatever
    // --keychain says (a GitHub macOS runner answers "no identity found"), so the
    // throwaway keychain joins it for the signing and the old list comes back after.
    const searchList = parseKeychains(security("list-keychains", "-d", "user"));
    security("list-keychains", "-d", "user", "-s", keychain, ...searchList);
    restore = () => security("list-keychains", "-d", "user", "-s", ...searchList);
    const hash = pickIdentity(security("find-identity", "-p", "codesigning", keychain));
    if (!hash) throw new Error(`no "${SIGNING_CN}" identity in ANDREY_SIGN_P12`);
    const optionsForFile = (file: string): FileOptions => ({ ...opts.optionsForFile?.(file), timestamp: "none" });
    return await signAsync({ ...opts, identity: hash, keychain, optionsForFile } as never);
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
}
