#!/bin/sh
set -eu

install_dir="${ROOBRO_INSTALL_DIR:-/opt/roobro}"
release_ref="${ROOBRO_REF:-main}"
raw_base="${ROOBRO_RAW_BASE:-https://raw.githubusercontent.com/4H1R/roobro/${release_ref}}"
env_file="${install_dir}/.env.prod"
compose_file="${install_dir}/docker-compose.prod.yml"

for required_command in curl docker od tr; do
	if ! command -v "$required_command" >/dev/null 2>&1; then
		echo "error: required command not found: ${required_command}" >&2
		exit 1
	fi
done

if ! docker compose version >/dev/null 2>&1; then
	echo "error: Docker Compose v2 is required (docker compose)" >&2
	exit 1
fi

case "$(docker compose up --help 2>&1)" in
	*--wait*) ;;
	*)
		echo "error: this installer requires a Docker Compose version with --wait support" >&2
		exit 1
		;;
esac

if ! mkdir -p "${install_dir}/deploy"; then
	echo "error: cannot create ${install_dir}; run the installer through sudo" >&2
	exit 1
fi

download_file() {
	download_url="$1"
	download_target="$2"
	curl -fsSL "$download_url" -o "${download_target}.tmp"
	chmod 644 "${download_target}.tmp"
	mv "${download_target}.tmp" "$download_target"
}

download_file "${raw_base}/docker-compose.prod.yml" "$compose_file"
download_file "${raw_base}/deploy/Caddyfile.internal" "${install_dir}/deploy/Caddyfile.internal"
download_file "${raw_base}/deploy/Caddyfile" "${install_dir}/deploy/Caddyfile"

random_hex() {
	od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

if [ ! -f "$env_file" ]; then
	public_host="${ROOBRO_PUBLIC_HOST:-}"
	if [ -z "$public_host" ]; then
		public_host="$(curl -4fsSL --max-time 5 https://api.ipify.org || true)"
	fi
	if [ -z "$public_host" ]; then
		echo "error: could not detect the public IPv4 address; set ROOBRO_PUBLIC_HOST" >&2
		exit 1
	fi
	app_port="${ROOBRO_APP_PORT:-80}"
	livekit_signal_port="${ROOBRO_LIVEKIT_SIGNAL_PORT:-7880}"
	livekit_tcp_port="${ROOBRO_LIVEKIT_TCP_PORT:-7881}"
	livekit_udp_port="${ROOBRO_LIVEKIT_UDP_PORT:-7882}"
	if [ "$app_port" = "80" ]; then
		frontend_url="http://${public_host}"
	else
		frontend_url="http://${public_host}:${app_port}"
	fi

	umask 077
	{
		echo "REGISTRY=ghcr.io/4h1r"
		echo "IMAGE_TAG=latest"
		echo "FRONTEND_URL=${frontend_url}"
		echo "LIVEKIT_PUBLIC_URL=ws://${public_host}:${livekit_signal_port}"
		echo "LIVEKIT_API_KEY=lk_$(random_hex 8)"
		echo "LIVEKIT_API_SECRET=$(random_hex 32)"
		echo "APP_BIND_ADDRESS=0.0.0.0"
		echo "APP_PORT=${app_port}"
		echo "LIVEKIT_SIGNAL_BIND_ADDRESS=0.0.0.0"
		echo "LIVEKIT_SIGNAL_PORT=${livekit_signal_port}"
		echo "LIVEKIT_TCP_PORT=${livekit_tcp_port}"
		echo "LIVEKIT_UDP_PORT=${livekit_udp_port}"
	} > "$env_file"
	chmod 600 "$env_file"
	echo "created ${env_file} with generated LiveKit credentials"
else
	echo "keeping existing ${env_file}"
fi

cd "$install_dir"
docker compose --env-file "$env_file" -f "$compose_file" pull
docker compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans --wait --wait-timeout 120
docker compose --env-file "$env_file" -f "$compose_file" ps

echo
echo "Roobro is running. Open the FRONTEND_URL recorded in ${env_file}."
echo "Allow the configured app/signaling/media ports through the server firewall."
echo "Camera and microphone access require a trusted HTTPS domain."
echo "Deployment guide: https://github.com/4H1R/roobro/blob/${release_ref}/docs/deployment.md"
