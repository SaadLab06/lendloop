#!/usr/bin/env bash
# Deploys LendLoop to a Docker host that already runs the stack in compose.yml.
# It refuses to run with uncommitted changes, so the Convex functions and the app image
# always come from the same commit.
#
#   SSH_HOST=myserver bash deploy/home-server/deploy.sh
#
# Needs locally: CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY in .env.local (Convex CLI).
# Needs on the host: STACK_DIR/.env filled from deploy/home-server/.env.example.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${SSH_HOST:?set SSH_HOST}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first: convex deploy pushes the working tree, the app uses HEAD."
  exit 1
fi
STACK_DIR=${STACK_DIR:-stacks/lendloop} # relative to the remote home directory

echo "1/3 Pushing Convex functions, schema and indexes to the self-hosted backend"
./node_modules/.bin/convex deploy --yes

echo "2/3 Copying the committed source and compose file to $SSH_HOST:$STACK_DIR"
ssh "$SSH_HOST" "mkdir -p $STACK_DIR && rm -rf $STACK_DIR/app && mkdir $STACK_DIR/app"
git archive --format=tar HEAD | ssh "$SSH_HOST" "tar -x -C $STACK_DIR/app"
scp -q deploy/home-server/compose.yml "$SSH_HOST:$STACK_DIR/compose.yml"

echo "3/3 Building and restarting the app container"
ssh "$SSH_HOST" "cd $STACK_DIR && docker compose up -d --build app && docker image prune -f >/dev/null"
echo "Deployed."
