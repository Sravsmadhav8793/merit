import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const secrets = resolve(root, "release-secrets");
const keyFile = resolve(secrets, "android-upload.jks");
const passwordFile = resolve(secrets, "android-upload.password.dpapi");
const unsignedBundle = resolve(import.meta.dirname, "android/app/build/outputs/bundle/release/app-release.aab");
const signedBundle = resolve(import.meta.dirname, "android/app/build/outputs/bundle/release/signed-release.aab");
const jdk = resolve(process.env.JAVA_HOME || "D:/SravantixERP/Sravantix_ERP/.runtime/android-tools/jdk17/jdk-17.0.21.0.2+1", "bin");
const keytool = resolve(jdk, "keytool.exe");
const jarsigner = resolve(jdk, "jarsigner.exe");
const envName = "SRAVANTIX_UPLOAD_PASSWORD";
function run(file, args, env = process.env) {
  const result = spawnSync(file, args, { env, cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error(`${file.split(/[\\/]/).at(-1)} failed: ${(result.stderr || result.stdout).replaceAll(env[envName] || "\0", "[redacted]").slice(0, 600)}`);
  return result.stdout || result.stderr;
}
if (!existsSync(unsignedBundle)) throw Error("Build the Android release bundle first");
mkdirSync(secrets, { recursive: true });
if (existsSync(keyFile) !== existsSync(passwordFile)) throw Error("Upload key or encrypted password is missing; do not replace the signing identity");
let password;
if (!existsSync(keyFile)) {
  password = randomBytes(36).toString("base64url");
  const env = { ...process.env, [envName]: password };
  run(keytool, ["-genkeypair", "-alias", "upload", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-storetype", "PKCS12", "-keystore", keyFile, "-storepass:env", envName, "-keypass:env", envName, "-dname", "CN=Sravantix Android Upload, O=Sravantix, L=Bengaluru, ST=Karnataka, C=IN"], env);
  run("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", "$v=ConvertTo-SecureString $env:SRAVANTIX_UPLOAD_PASSWORD -AsPlainText -Force; $v | ConvertFrom-SecureString | Set-Content -LiteralPath $env:SRAVANTIX_PASSWORD_FILE"], { ...env, SRAVANTIX_PASSWORD_FILE: passwordFile });
} else {
  password = run("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", "$v=Get-Content -LiteralPath $env:SRAVANTIX_PASSWORD_FILE | ConvertTo-SecureString; [System.Net.NetworkCredential]::new('', $v).Password"], { ...process.env, SRAVANTIX_PASSWORD_FILE: passwordFile }).trim();
}
const env = { ...process.env, [envName]: password };
try {
  run(jarsigner, ["-keystore", keyFile, "-storetype", "PKCS12", "-storepass:env", envName, "-keypass:env", envName, "-sigalg", "SHA256withRSA", "-digestalg", "SHA-256", "-signedjar", signedBundle, unsignedBundle, "upload"], env);
  const verify = run(jarsigner, ["-verify", "-strict", "-keystore", keyFile, "-storepass:env", envName, signedBundle], env);
  if (!verify.includes("jar verified")) throw Error("Signed bundle verification failed");
  const certificate = run(keytool, ["-list", "-v", "-alias", "upload", "-keystore", keyFile, "-storepass:env", envName], env);
  const fingerprint = certificate.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1];
  if (!fingerprint) throw Error("Upload certificate fingerprint not found");
  const bytes = readFileSync(signedBundle);
  const twa = JSON.parse(readFileSync(resolve(import.meta.dirname, "twa-manifest.json"), "utf8"));
  const metadata = { packageId: twa.packageId, versionCode: twa.appVersionCode, bundle: signedBundle, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), uploadCertificateSha256: fingerprint };
  writeFileSync(resolve(import.meta.dirname, "android-release-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  process.stdout.write(JSON.stringify(metadata) + "\n");
} finally {
  password = "";
  delete env[envName];
}
