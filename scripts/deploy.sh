#!/usr/bin/env bash
set -euo pipefail

main() {
  local allow_migrations=false
  case "${1:-}" in
    --allow-migrations) allow_migrations=true; shift ;;
    -h|--help)
      printf 'Uso: bash scripts/deploy.sh [--allow-migrations]\n'
      return 0
      ;;
  esac
  if (( $# > 0 )); then
    printf 'Uso: bash scripts/deploy.sh [--allow-migrations]\n' >&2
    return 2
  fi

  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
  local phase='validar el checkout'
  trap 'code=$?; printf "Falló el despliegue al %s (código %s).\n" "$phase" "$code" >&2; exit "$code"' ERR

  local lock_file branch changes target
  lock_file=$(git rev-parse --git-path infoprepaga-deploy.lock)
  exec 9>"$lock_file"
  if ! flock -n 9; then
    printf 'Ya hay un despliegue en curso.\n' >&2
    return 1
  fi

  branch=$(git branch --show-current)
  changes=$(git status --porcelain)
  if [[ "$branch" != main || -n "$changes" || ! -f .env ]]; then
    printf 'El checkout de producción debe estar en main, limpio y con su archivo .env.\n' >&2
    return 1
  fi

  phase='actualizar el código desde origin/main'
  git fetch origin main
  target=$(git rev-parse FETCH_HEAD)
  if ! git merge-base --is-ancestor HEAD "$target"; then
    printf 'El checkout del VPS contiene commits fuera de origin/main. Revisá el historial.\n' >&2
    return 1
  fi
  git merge --ff-only "$target"
  git log -1 --oneline

  local -a compose=(sudo docker compose --env-file .env -f compose.yaml)
  phase='validar Compose'
  "${compose[@]}" config --quiet
  phase='compilar las imágenes'
  "${compose[@]}" build migrate api web

  if [[ "$allow_migrations" == true ]]; then
    phase='respaldar PostgreSQL'
    (
      umask 077
      backup_dir="$HOME/infoprepaga-backups"
      mkdir -p "$backup_dir"
      backup=$(mktemp --suffix=.dump "$backup_dir/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
      trap 'rm -f -- "$backup"' EXIT
      "${compose[@]}" exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
      "${compose[@]}" exec -T postgres pg_restore --list < "$backup" > /dev/null
      trap - EXIT
      printf 'Respaldo de PostgreSQL: %s\n' "$backup"
    )
  elif ! "${compose[@]}" run --rm --no-deps -T migrate pnpm exec prisma migrate status; then
    printf 'Prisma no confirmó que la base esté al día. Revisá la salida antes de reintentar.\n' >&2
    return 1
  fi

  phase='actualizar y esperar los servicios de Compose'
  "${compose[@]}" up -d --no-build --wait --wait-timeout 180
  "${compose[@]}" ps -a

  phase='verificar el HTTPS público'
  local http_status
  http_status=$(curl -fsS --max-time 10 --retry 3 --retry-max-time 40 --output /dev/null \
    --write-out '%{http_code}' https://crm.infoprepaga.com.ar/api/health)
  if [[ "$http_status" != 200 ]]; then
    printf 'El health check público devolvió HTTP %s.\n' "$http_status" >&2
    return 1
  fi
  printf 'Despliegue %s verificado. HTTPS /api/health: HTTP 200.\n' "${target:0:12}"
}

main "$@"
