CREATE TABLE IF NOT EXISTS passkey_credentials (
  id varchar(255) NOT NULL PRIMARY KEY,
  public_key text NOT NULL,
  counter bigint unsigned NOT NULL DEFAULT 0,
  transports text NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamp NULL
);
