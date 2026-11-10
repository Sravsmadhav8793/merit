# Upstox fixed-IP deployment

Real orders are disabled by default. Keep Analytics tokens out of this configuration: they are read-only and cannot trade.

1. Create/authorize an Upstox Algo Trading app. Set its redirect URL to `https://YOUR_DOMAIN/api/upstox/callback`.
2. Register the fixed public egress IP of the server with Upstox. All API calls must originate from that IP; database and frontend hosting are irrelevant to this requirement.
3. Set server-only secrets: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`, and a unique random `UPSTOX_TOKEN_ENCRYPTION_KEY`. Never use `VITE_` prefixes and never commit the values.
4. Apply the database migration. Start with `UPSTOX_LIVE_TRADING=false`, verify sign-in and OAuth, then set `UPSTOX_STATIC_IP_REGISTERED=true` only after Upstox confirms the IP registration.
5. Set a conservative `UPSTOX_MAX_ORDER_VALUE` in INR. After reviewing the order workflow and reconciliation behavior, set `UPSTOX_LIVE_TRADING=true` and restart the service.
6. The signed-in MERIT user must authorize Upstox at the start of each trading day. Tokens expire at Upstox's daily cutoff. Delivery sells may require CDSL/DDPI/EDIS authorization; F&O requires the relevant enabled segment and sufficient margin.
7. Instrument tokens must come from Upstox's current BOD instrument files. For F&O, quantity means units, so validate the contract lot size before confirming.
8. If a request times out, its journal status is `UNKNOWN`. Reconcile the Upstox order book before any retry. A broker acknowledgement is not a fill; use the synchronized order book for execution status.

Use HTTPS, a process manager, firewall-restricted database access, encrypted backups, and centralized server logs. Do not expose this service publicly without the included user authentication.
