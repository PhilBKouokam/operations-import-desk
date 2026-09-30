#!/usr/bin/env bash
# Ubuntu 22.04/24.04 x86_64; requires curl, tar, make, gcc, pkg-config, Java 17.
set -euo pipefail
runtime_dir=${1:?Usage: bash scripts/install-native-services.sh ABSOLUTE_NEW_DIRECTORY}
[[ "$runtime_dir" = /* && ! -e "$runtime_dir" ]] || { echo 'Choose a new absolute directory'; exit 1; }
mkdir -p "$runtime_dir"
curl --fail --location --retry 3 https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-8.0.15.tgz -o "$runtime_dir/mongo.tgz"
curl --fail --location --retry 3 https://github.com/keycloak/keycloak/releases/download/26.4.0/keycloak-26.4.0.tar.gz -o "$runtime_dir/keycloak.tgz"
curl --fail --location --retry 3 https://download.redis.io/releases/redis-7.4.6.tar.gz -o "$runtime_dir/redis.tgz"
# gzip validation fails early if a proxy returns an HTML error with status 200.
for archive in mongo keycloak redis; do gzip -t "$runtime_dir/$archive.tgz"; tar --no-same-owner -xzf "$runtime_dir/$archive.tgz" -C "$runtime_dir"; done
make -C "$runtime_dir/redis-7.4.6" -j2 MALLOC=libc BUILD_TLS=no > "$runtime_dir/redis-build.txt" 2>&1
sha256sum "$runtime_dir/"*.tgz > "$runtime_dir/download-sha256.txt"
# These paths are derived locally, not executable download content.
printf 'export MONGOD_BIN=%q\nexport KEYCLOAK_HOME=%q\nexport REDIS_SERVER_BIN=%q\n' "$runtime_dir/mongodb-linux-x86_64-ubuntu2204-8.0.15/bin/mongod" "$runtime_dir/keycloak-26.4.0" "$runtime_dir/redis-7.4.6/src/redis-server" > "$runtime_dir/env.sh"
echo "Installed pinned releases. Source $runtime_dir/env.sh. Checksums record downloaded bytes; they are not independent publisher-signature verification."
