# Vault API

This is the local backend foundation for the prototype. It uses Node's built-in
SQLite driver and stores data in `data/vault.db`.

Start it with `npm run api` (port `8787` by default). Set `VAULT_DEVICE_KEY`
to require `X-API-Key` on ESP32 reading uploads.

Endpoints:

- `GET /api/health`
- `GET /api/readings?shipmentId=...`
- `GET /api/ledger?shipmentId=...`
- `GET /api/alarms/status?shipmentId=...&deviceId=...`
- `POST /api/readings` with `{ shipmentId, deviceId, temperature, humidity, timestamp }`
- `POST /api/alarms/acknowledge` with `{ shipmentId, deviceId }`
- `GET` / `POST /api/devices/:deviceId/alarm` for ESP32 acknowledgement polling and confirmation
- `POST /api/auth/register` with `{ email, password, organizationName }`
- `POST /api/auth/login` with `{ email, password }`
- `POST /api/organizations/telegram` with `{ chatId }` and `Authorization: Bearer <token>`

Registration creates an organisation and its first `ADMIN` user. Passwords are
stored as salted scrypt hashes; login returns a bearer token for the next
provider-integration step.

Set `TELEGRAM_BOT_TOKEN` to enable automatic excursion alerts. The chat ID is
stored per organisation through the authenticated Telegram configuration route.
Without both values, ingestion succeeds and reports `telegram.skipped: true`.

This layer is intentionally separate from the browser provider until the API
contract is exercised and the frontend data-source swap is made as its own step.
