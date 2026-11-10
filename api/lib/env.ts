import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appSecret: required("APP_SECRET"),
  adminEmail: required("ADMIN_EMAIL"),
  adminPasswordScrypt: required("ADMIN_PASSWORD_SCRYPT"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  databaseCaFile: process.env.DATABASE_CA_FILE ?? "",
};

if (env.isProduction) {
  if (env.appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(env.adminPasswordScrypt)) throw new Error("ADMIN_PASSWORD_SCRYPT must be salt:hash");
}
