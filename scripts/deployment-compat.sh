#!/usr/bin/env bash
# Shared compatibility reads for deployments made before the Workloom rename.
# Source this file from the deployment directory; never source a user's .env.

workloom_env_value() {
  [ -f .env ] || return 0
  awk -v key="$1" 'index($0, key "=") == 1 { value=substr($0, length(key)+2); found=1 } END { if (found) { if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value=substr(value,2,length(value)-2); print value } }' .env
}

workloom_set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if [ -f .env ]; then
    WORKLOOM_ENV_VALUE="$value" awk -v key="$key" 'BEGIN { done=0; value=ENVIRON["WORKLOOM_ENV_VALUE"] } index($0,key "=")==1 { if (!done) print key "=" value; done=1; next } {print} END {if (!done) print key "=" value}' .env > "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp"
  fi
  # Preserve permissions on an existing file and avoid a world-readable new file.
  (umask 077; cat "$tmp" > .env)
  rm -f "$tmp"
  export "$key=$value"
}

workloom_value() {
  local suffix="$1" value
  value="$(printenv "WORKLOOM_$suffix" 2>/dev/null || true)"
  [ -n "$value" ] || value="$(workloom_env_value "WORKLOOM_$suffix")"
  [ -n "$value" ] || value="$(printenv "JIANJI_$suffix" 2>/dev/null || true)"
  [ -n "$value" ] || value="$(workloom_env_value "JIANJI_$suffix")"
  printf '%s' "${value:-${2:-}}"
}

workloom_current_url() {
  # Migrate only known historical URLs, preserving custom forks and mirrors.
  case "$1" in
    https://github.com/staklab/jianji|https://github.com/staklab/jianji.git|https://github.com/bbmy85552/jianji|https://github.com/bbmy85552/jianji.git|git@github.com:staklab/jianji.git|git@github.com:bbmy85552/jianji.git)
      printf '%s' 'https://github.com/bbmy85552/Workloom.git' ;;
    https://api.github.com/repos/staklab/jianji/*) printf 'https://api.github.com/repos/bbmy85552/Workloom/%s' "${1#https://api.github.com/repos/staklab/jianji/}" ;;
    https://api.github.com/repos/bbmy85552/jianji/*) printf 'https://api.github.com/repos/bbmy85552/Workloom/%s' "${1#https://api.github.com/repos/bbmy85552/jianji/}" ;;
    https://github.com/staklab/jianji/archive/*) printf 'https://github.com/bbmy85552/Workloom/archive/%s' "${1#https://github.com/staklab/jianji/archive/}" ;;
    https://github.com/bbmy85552/jianji/archive/*) printf 'https://github.com/bbmy85552/Workloom/archive/%s' "${1#https://github.com/bbmy85552/jianji/archive/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

workloom_migrate_config() {
  local key value
  for key in LATEST_VERSION CURRENT_COMMIT UPDATE_REPO UPDATE_BRANCH UPDATE_CHECK_URL UPDATE_COMMAND UPDATE_ARCHIVE_URL; do
    value="$(workloom_value "$key")"
    case "$key" in UPDATE_REPO|UPDATE_CHECK_URL|UPDATE_ARCHIVE_URL) value="$(workloom_current_url "$value")" ;; esac
    workloom_set_env "WORKLOOM_$key" "$value"
  done
}

workloom_migrate_origin() {
  local old new
  old="$(git config --get remote.origin.url 2>/dev/null || true)"
  new="$(workloom_current_url "$old")"
  if [ -n "$old" ] && [ "$old" != "$new" ]; then
    git remote set-url origin "$new"
    echo 'Updated deployment origin to Workloom.'
  fi
}

workloom_mount() {
  docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}" "$1" 2>/dev/null || true
}

workloom_prepare_storage() {
  local compose_file="${1:-docker-compose.yml}" allow_new="${2:-false}" ids id data uploads workdir seen='' data_name='' uploads_name='' current_name previous_data='' previous_uploads='' previous_name='' data_exists=false uploads_exists=false configured_data configured_uploads
  WORKLOOM_OLD_CONTAINER=''
  configured_data="$(workloom_value DATA_VOLUME)"
  configured_uploads="$(workloom_value UPLOADS_VOLUME)"
  # Compose identities first; fixed historical container names cover a renamed checkout.
  ids="$(docker compose -f "$compose_file" ps -a -q 2>/dev/null || true)"
  for current_name in workloom "${WORKLOOM_LEGACY_CONTAINER:-jianji}"; do
    id="$(docker inspect -f '{{.Id}}' "$current_name" 2>/dev/null || true)"
    if [ -n "$id" ] && ! printf '%s\n' "$ids" | grep -Fxq "$id"; then ids="${ids}${ids:+$'\n'}$id"; fi
  done
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    current_name="$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null || true)"
    data="$(workloom_mount "$id" /app/data)"
    uploads="$(workloom_mount "$id" /app/uploads)"
    [ -n "$data$uploads" ] || continue
    workdir="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$id" 2>/dev/null || true)"
    if [ -n "$workdir" ] && [ "$workdir" != '<no value>' ] && [ "$workdir" != "$(pwd -P)" ] && [ "${WORKLOOM_LEGACY_CONTAINER:-}" != "$id" ]; then
      echo "Existing application container belongs to $workdir. Update from that directory, or explicitly set WORKLOOM_LEGACY_CONTAINER to its container ID after checking the deployment." >&2
      return 1
    fi
    case "$data" in volume\|?*\|*) data_name="${data#volume|}"; data_name="${data_name%%|*}" ;; *) echo 'Cannot safely map the existing database mount. Keep the current deployment and migrate bind mounts manually before updating.' >&2; return 1 ;; esac
    case "$uploads" in volume\|?*\|*) uploads_name="${uploads#volume|}"; uploads_name="${uploads_name%%|*}" ;; *) echo 'Cannot safely map the existing uploads mount. Keep the current deployment and migrate bind mounts manually before updating.' >&2; return 1 ;; esac
    if [ -n "$seen" ] && [ "$seen" != "$id" ]; then
      if [ "$previous_data" != "$data_name" ] || [ "$previous_uploads" != "$uploads_name" ]; then
        echo 'Multiple application containers use different storage; resolve the deployment identity before updating.' >&2; return 1
      fi
      # A retained, stopped predecessor is expected after the first migration.
      if [ "$previous_name" = /workloom ] && [ "$(docker inspect -f '{{.State.Running}}' "$id")" != true ]; then continue; fi
      if [ "$current_name" != /workloom ] || [ "$(docker inspect -f '{{.State.Running}}' "$seen")" = true ]; then
        echo 'Multiple active application containers found; resolve the deployment identity before updating.' >&2; return 1
      fi
    fi
    seen="$id"
    previous_data="$data_name"
    previous_uploads="$uploads_name"
    previous_name="$current_name"
    if [ "$current_name" != /workloom ]; then WORKLOOM_OLD_CONTAINER="$id"; else WORKLOOM_OLD_CONTAINER=''; fi
  done <<< "$ids"
  workloom_resolve_volume DATA "$data_name" || return 1
  workloom_resolve_volume UPLOADS "$uploads_name" || return 1
  data_name="$WORKLOOM_RESOLVED_DATA_VOLUME"
  uploads_name="$WORKLOOM_RESOLVED_UPLOADS_VOLUME"
  if [ -z "$seen" ] && { [ -z "$configured_data" ] || [ -z "$configured_uploads" ]; } && [ "${data_name%-data}" != "${uploads_name%-uploads}" ]; then
    echo 'Detected storage volumes belong to different projects. Explicitly map both WORKLOOM volumes after checking the deployment.' >&2; return 1
  fi
  docker volume inspect "$data_name" >/dev/null 2>&1 && data_exists=true
  docker volume inspect "$uploads_name" >/dev/null 2>&1 && uploads_exists=true
  if [ "$data_exists" != "$uploads_exists" ]; then
    echo 'Only one storage volume exists. Refusing to attach a new empty database or uploads volume; set both WORKLOOM volume mappings to the existing volumes.' >&2; return 1
  fi
  if [ "$data_exists" = false ] && { [ "$data_name" != workloom-data ] || [ "$uploads_name" != workloom-uploads ]; }; then
    echo 'Configured storage volumes do not exist. Refusing to create empty replacements.' >&2; return 1
  fi
  if [ "$data_exists" = false ] && [ "$allow_new" != true ]; then
    echo 'No existing storage volumes were found. An update cannot create replacement storage; verify both WORKLOOM volume mappings.' >&2; return 1
  fi
  workloom_set_env WORKLOOM_DATA_VOLUME "$data_name"
  workloom_set_env WORKLOOM_UPLOADS_VOLUME "$uploads_name"
  workloom_set_env WORKLOOM_VOLUMES_EXTERNAL "$data_exists"
}

workloom_resolve_volume() {
  local kind="$1" mounted="$2" configured default candidates count volume suffix all_volumes
  configured="$(workloom_value "${kind}_VOLUME")"
  if [ -n "$configured" ]; then
    if [ -n "$mounted" ] && [ "$configured" != "$mounted" ]; then
      echo "WORKLOOM_${kind}_VOLUME differs from the existing mount; refusing to switch to another volume." >&2; return 1
    fi
    volume="$configured"
  elif [ -n "$mounted" ]; then
    volume="$mounted"
  else
    case "$kind" in DATA) suffix=data ;; UPLOADS) suffix=uploads ;; esac
    default="workloom-$suffix"
    all_volumes="$(docker volume ls --format '{{.Name}}')" || return 1
    candidates="$(printf '%s\n' "$all_volumes" | awk -v suffix="$suffix" '$0 == "workloom-" suffix || $0 == "jianji-" suffix || $0 ~ "_jianji-" suffix "$" || $0 ~ "_workloom-" suffix "$"')"
    count="$(printf '%s\n' "$candidates" | awk 'NF { n++ } END { print n+0 }')"
    if [ "$count" -gt 1 ]; then echo "Multiple candidate $kind volumes found. Set WORKLOOM_${kind}_VOLUME to the existing physical volume name before updating." >&2; return 1; fi
    if [ "$count" -eq 1 ]; then volume="$candidates"; else volume="$default"; fi
  fi
  printf -v "WORKLOOM_RESOLVED_${kind}_VOLUME" '%s' "$volume"
}

workloom_stop_previous() {
  WORKLOOM_PREVIOUS_WAS_RUNNING=false
  [ -n "${WORKLOOM_OLD_CONTAINER:-}" ] || return 0
  if [ "$(docker inspect -f '{{.State.Running}}' "$WORKLOOM_OLD_CONTAINER")" = true ]; then
    echo 'Stopping the previous application container after a successful build; its container and volumes are retained.'
    docker stop "$WORKLOOM_OLD_CONTAINER" >/dev/null
    WORKLOOM_PREVIOUS_WAS_RUNNING=true
  fi
}

workloom_restore_previous() {
  if [ "${WORKLOOM_PREVIOUS_WAS_RUNNING:-false}" = true ]; then
    echo 'The new service failed. Stopping it and restarting the retained previous container.' >&2
    "$@" stop workloom >/dev/null 2>&1 || true
    docker start "$WORKLOOM_OLD_CONTAINER" >/dev/null
  fi
}
