#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example first."
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

required_vars=(
  ABS_BASE_URL
  ABS_ADMIN_USERNAME
  ABS_ADMIN_PASSWORD
  ABS_EMAIL_HOST
  ABS_EMAIL_PORT
  ABS_EMAIL_USERNAME
  ABS_EMAIL_PASSWORD
  ABS_EMAIL_FROM_ADDRESS
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required variable: ${name}"
    exit 1
  fi
done

login_response="$(
  curl -fsS \
    -H 'Content-Type: application/json' \
    -H 'x-return-tokens: true' \
    -X POST "${ABS_BASE_URL%/}/login" \
    --data "$(python - <<'PY'
import json, os
print(json.dumps({
    "username": os.environ["ABS_ADMIN_USERNAME"],
    "password": os.environ["ABS_ADMIN_PASSWORD"],
}))
PY
)"
)"

access_token="$(
  LOGIN_RESPONSE="${login_response}" python - <<'PY'
import json, os, sys
payload = json.loads(os.environ["LOGIN_RESPONSE"])
token = payload.get("user", {}).get("accessToken")
if not token:
    sys.exit("Login succeeded but no access token was returned")
print(token)
PY
)"

settings_payload="$(
  python - <<'PY'
import json, os
def as_bool(value: str, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

print(json.dumps({
    "host": os.environ["ABS_EMAIL_HOST"],
    "port": int(os.environ["ABS_EMAIL_PORT"]),
    "secure": as_bool(os.getenv("ABS_EMAIL_SECURE"), True),
    "rejectUnauthorized": as_bool(os.getenv("ABS_EMAIL_REJECT_UNAUTHORIZED"), True),
    "user": os.environ["ABS_EMAIL_USERNAME"],
    "pass": os.environ["ABS_EMAIL_PASSWORD"],
    "fromAddress": os.environ["ABS_EMAIL_FROM_ADDRESS"],
    "testAddress": os.getenv("ABS_EMAIL_TEST_ADDRESS") or None,
}))
PY
)"

curl -fsS \
  -H "Authorization: Bearer ${access_token}" \
  -H 'Content-Type: application/json' \
  -X PATCH "${ABS_BASE_URL%/}/api/emails/settings" \
  --data "${settings_payload}" >/dev/null

if [[ -n "${ABS_EMAIL_TEST_ADDRESS:-}" ]]; then
  curl -fsS \
    -H "Authorization: Bearer ${access_token}" \
    -X POST "${ABS_BASE_URL%/}/api/emails/test" >/dev/null
  echo "Audiobookshelf email settings updated and test email requested."
else
  echo "Audiobookshelf email settings updated."
fi
