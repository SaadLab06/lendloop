#!/usr/bin/env bash
# Imports the LendLoop credentials and workflows into a running n8n container, publishes them,
# and restarts n8n so the webhook and schedule triggers register.
#
# Required environment:
#   N8N_CONTAINER       name of the n8n container (local: lendloop-n8n-1)
#   CONVEX_SITE_URL     Convex HTTP actions URL as seen from inside the n8n container
#   N8N_WEBHOOK_SECRET  same value as the Convex env var (Convex -> n8n direction)
#   N8N_API_SECRET      same value as the Convex env var (n8n -> Convex direction)
# Optional:
#   SSH_HOST            run the docker commands on this host over ssh
#   RESTART=0           skip the restart (triggers then register on the next n8n restart)
#
# The secrets only exist in a temporary credentials file that is deleted at the end.
# The workflow JSON in the repo never contains them.
set -euo pipefail
cd "$(dirname "$0")"

: "${N8N_CONTAINER:?set N8N_CONTAINER}" "${CONVEX_SITE_URL:?set CONVEX_SITE_URL}"
: "${N8N_WEBHOOK_SECRET:?set N8N_WEBHOOK_SECRET}" "${N8N_API_SECRET:?set N8N_API_SECRET}"
for secret in "$N8N_WEBHOOK_SECRET" "$N8N_API_SECRET"; do
  [[ "$secret" =~ ^[A-Za-z0-9_-]{32,}$ ]] || { echo "Secrets must be 32+ URL-safe characters (openssl rand -hex 32)"; exit 1; }
done

run() { if [ -n "${SSH_HOST:-}" ]; then ssh "$SSH_HOST" "$@"; else bash -c "$*"; fi; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/workflows"

# Credentials are matched to the workflows by name and type (jwtAuth).
umask 077
cat > "$WORK/credentials.json" <<EOF
[
  {
    "id": "lendLoopJwtIn001",
    "name": "LendLoop: Convex to n8n",
    "type": "jwtAuth",
    "data": { "keyType": "passphrase", "secret": "$N8N_WEBHOOK_SECRET", "algorithm": "HS256" }
  },
  {
    "id": "lendLoopJwtOut01",
    "name": "LendLoop: n8n to Convex",
    "type": "jwtAuth",
    "data": { "keyType": "passphrase", "secret": "$N8N_API_SECRET", "algorithm": "HS256" }
  }
]
EOF

# The only per-environment value in the workflows is the Convex site URL in the Config/Event nodes.
for file in workflows/*.json; do
  sed "s|http://host.docker.internal:3211|${CONVEX_SITE_URL}|g" "$file" > "$WORK/$file"
done

REMOTE_DIR=/tmp/lendloop-n8n-import
if [ -n "${SSH_HOST:-}" ]; then
  ssh "$SSH_HOST" "rm -rf $REMOTE_DIR && mkdir -m 700 $REMOTE_DIR"
  scp -q -r "$WORK/credentials.json" "$WORK/workflows" "$SSH_HOST:$REMOTE_DIR/"
  SRC=$REMOTE_DIR
else
  SRC=$WORK
fi

run "docker exec $N8N_CONTAINER rm -rf $REMOTE_DIR && docker cp $SRC $N8N_CONTAINER:$REMOTE_DIR"
run "docker exec $N8N_CONTAINER n8n import:credentials --input=$REMOTE_DIR/credentials.json"
run "docker exec $N8N_CONTAINER n8n import:workflow --separate --input=$REMOTE_DIR/workflows"
run "docker exec $N8N_CONTAINER rm -rf $REMOTE_DIR"
if [ -n "${SSH_HOST:-}" ]; then ssh "$SSH_HOST" "rm -rf $REMOTE_DIR"; fi

for id in lendLoopErrors01 lendLoopNotify01 lendLoopRemind01; do
  run "docker exec $N8N_CONTAINER n8n publish:workflow --id=$id" | grep -i "publish" || true
done

if [ "${RESTART:-1}" = "1" ]; then
  echo "Restarting $N8N_CONTAINER so the triggers register..."
  run "docker restart $N8N_CONTAINER >/dev/null && for i in \$(seq 1 45); do docker exec $N8N_CONTAINER wget -qO- http://localhost:5678/healthz >/dev/null 2>&1 && break; sleep 2; done"
fi
echo "Done: LendLoop workflows imported and published."
