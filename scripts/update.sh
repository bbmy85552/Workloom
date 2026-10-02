#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${WORKLOOM_PROJECT_DIR:-${JIANJI_PROJECT_DIR:-$(pwd)}}"
SERVICE_NAME="workloom"
DOWNLOADED_COMMIT=""

cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd -P)"
BACKUP_DIR="${WORKLOOM_UPDATE_BACKUP_DIR:-${JIANJI_UPDATE_BACKUP_DIR:-$PROJECT_DIR/.update-backups}}"
source scripts/deployment-compat.sh

env_value() { workloom_env_value "$1"; }

set_env_value() { workloom_set_env "$1" "$2"; }

github_commit_api_url() {
  local repo="${1%.git}"
  local branch="$2"
  local path=""
  case "$repo" in
    https://github.com/*) path="${repo#https://github.com/}" ;;
    git@github.com:*) path="${repo#git@github.com:}" ;;
  esac
  if [ "$path" != "" ]; then
    printf 'https://api.github.com/repos/%s/commits/%s' "$path" "$branch"
  fi
}

github_archive_url() {
  local repo="${1%.git}"
  local branch="$2"
  local path=""
  case "$repo" in
    https://github.com/*) path="${repo#https://github.com/}" ;;
    git@github.com:*) path="${repo#git@github.com:}" ;;
  esac
  if [ "$path" != "" ]; then
    printf 'https://github.com/%s/archive/refs/heads/%s.tar.gz' "$path" "$branch"
  fi
}

fetch_commit_from_url() {
  local url="$1"
  if [ "$url" = "" ] || ! command -v curl >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    return
  fi
  curl -fsSL "$url" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);const sha=j.sha||(j.object&&j.object.sha)||'';if(/^[0-9a-f]{7,40}$/i.test(sha)) console.log(sha);}catch{}})"
}

remove_runtime_only_files() {
  local source_dir="$1"
  rm -rf \
    "$source_dir/.git" \
    "$source_dir/.env" \
    "$source_dir/SETUP_URL.txt" \
    "$source_dir/certs" \
    "$source_dir/.acme.sh" \
    "$source_dir/node_modules" \
    "$source_dir/server/node_modules" \
    "$source_dir/dist" \
    "$source_dir/server/dist" \
    "$source_dir/server/uploads" \
    "$source_dir/uploads" \
    "$source_dir/.update-backups"
  find "$source_dir/server/prisma" -type f \( -name '*.db' -o -name '*.db-*' \) -delete 2>/dev/null || true
}

refresh_source_tree() {
  if [ "$(workloom_value SKIP_SOURCE_REFRESH false)" = "true" ]; then
    echo "Skipping source refresh because WORKLOOM_SKIP_SOURCE_REFRESH=true."
    return
  fi
  if [ -e ".git" ]; then
    echo "Pulling latest source ..."
    workloom_migrate_origin
    git fetch origin --prune
    local pull_branch
    pull_branch="$(git branch --show-current 2>/dev/null || true)"
    pull_branch="${pull_branch:-$(workloom_value UPDATE_BRANCH main)}"
    git pull --ff-only origin "$pull_branch"
    return
  fi

  local branch=""
  local repo=""
  local archive_url=""
  local check_url=""
  local tmp_dir=""
  branch="$(workloom_value UPDATE_BRANCH)"
  branch="${branch:-main}"
  repo="$(workloom_value UPDATE_REPO)"
  repo="$(workloom_current_url "${repo:-https://github.com/bbmy85552/Workloom.git}")"
  archive_url="$(workloom_value UPDATE_ARCHIVE_URL)"
  archive_url="$(workloom_current_url "${archive_url:-$(github_archive_url "$repo" "$branch")}")"
  if [ "$archive_url" = "" ] || ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
    echo "No .git directory found and source archive is unavailable; using the current source tree."
    return
  fi

  echo "No .git directory found; downloading latest source archive ..."
  echo "Source: $repo#$branch"
  tmp_dir="$(mktemp -d)"
  curl -fsSL "$archive_url" -o "$tmp_dir/source.tar.gz"
  mkdir -p "$tmp_dir/source"
  tar -xzf "$tmp_dir/source.tar.gz" --strip-components=1 -C "$tmp_dir/source"
  remove_runtime_only_files "$tmp_dir/source"
  cp -a "$tmp_dir/source/." "$PROJECT_DIR/"
  rm -rf "$tmp_dir"

  check_url="$(workloom_value UPDATE_CHECK_URL)"
  check_url="$(workloom_current_url "${check_url:-$(github_commit_api_url "$repo" "$branch")}")"
  DOWNLOADED_COMMIT="$(fetch_commit_from_url "$check_url" || true)"
}

write_deployment_metadata() {
  local branch repo commit version check_url
  branch="$(git branch --show-current 2>/dev/null || true)"
  branch="${branch:-$(workloom_value UPDATE_BRANCH main)}"
  repo="$(git config --get remote.origin.url 2>/dev/null || true)"
  repo="$(workloom_current_url "${repo:-$(workloom_value UPDATE_REPO https://github.com/bbmy85552/Workloom.git)}")"
  commit="$(git rev-parse HEAD 2>/dev/null || true)"
  commit="${commit:-${DOWNLOADED_COMMIT:-$(workloom_value CURRENT_COMMIT)}}"
  version="$(workloom_value APP_VERSION)"
  version="${version:-$(git describe --tags --always --dirty 2>/dev/null || printf '0.1.0')}"
  check_url="$(workloom_current_url "$(workloom_value UPDATE_CHECK_URL "$(github_commit_api_url "$repo" "$branch")")")"
  set_env_value APP_VERSION "$version"
  set_env_value WORKLOOM_CURRENT_COMMIT "$commit"
  set_env_value WORKLOOM_UPDATE_REPO "$repo"
  set_env_value WORKLOOM_UPDATE_BRANCH "$branch"
  set_env_value WORKLOOM_UPDATE_CHECK_URL "$check_url"
}

wait_for_service() {
  local id=""
  local status=""
  local attempt=0
  echo "Waiting for $SERVICE_NAME to become healthy ..."
  for attempt in {1..80}; do
    id="$(docker compose ps -q "$SERVICE_NAME" 2>/dev/null || true)"
    if [ "$id" != "" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
        echo "$SERVICE_NAME status: $status"
        return 0
      fi
    fi
    sleep 2
  done
  echo "$SERVICE_NAME did not become healthy in time." >&2
  docker compose ps >&2 || true
  docker compose logs --tail=80 "$SERVICE_NAME" >&2 || true
  return 1
}

if [ ! -f "docker-compose.yml" ] || [ ! -f ".env" ]; then
  echo "Please run this script from the Workloom deployment directory, or set WORKLOOM_PROJECT_DIR." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d%H%M%S)"
cp .env "$BACKUP_DIR/.env.$STAMP"

if [ -f SETUP_URL.txt ]; then
  cp SETUP_URL.txt "$BACKUP_DIR/SETUP_URL.txt.$STAMP"
fi

echo "== Workloom safe update =="
echo "Project: $PROJECT_DIR"
echo "Config backup: $BACKUP_DIR/.env.$STAMP"
echo "Docker volumes are preserved. This script does not delete databases or uploads."
echo

workloom_migrate_config
workloom_prepare_storage "${COMPOSE_FILE:-docker-compose.yml}"

refresh_source_tree

write_deployment_metadata

echo
echo "Rebuilding and restarting Workloom ..."
docker compose build "$SERVICE_NAME"
workloom_stop_previous
if ! docker compose up -d --no-build "$SERVICE_NAME" || ! wait_for_service; then
  workloom_restore_previous docker compose
  exit 1
fi

echo
echo "Running service check ..."
docker compose ps
docker compose logs --tail=40 "$SERVICE_NAME"

echo
echo "Update complete."
echo "If this instance is not initialized yet, view the setup link with:"
echo "  cat $PROJECT_DIR/SETUP_URL.txt"
