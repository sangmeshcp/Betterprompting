#!/usr/bin/env sh
# Betterprompting installer.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/sangmeshcp/betterprompting/main/install.sh | sh
#
# Installs the `betterprompting` CLI into ~/.betterprompting/bin and symlinks
# it into /usr/local/bin (or $PREFIX/bin) if that's on PATH and writable.
# Falls back to a clear "add this to PATH" message otherwise.

set -eu

REPO="${BETTERPROMPTING_REPO:-sangmeshcp/betterprompting}"
REF="${BETTERPROMPTING_REF:-main}"
PREFIX="${BETTERPROMPTING_PREFIX:-$HOME/.betterprompting}"
BIN_DIR="$PREFIX/bin"

say() { printf "\033[1;36m[betterprompting]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || err "Node.js >= 20 is required. Install it first: https://nodejs.org"
node_major=$(node -p "process.versions.node.split('.')[0]")
if [ "$node_major" -lt 20 ]; then
  err "Node.js 20+ is required (you have $(node -v))."
fi
command -v git >/dev/null 2>&1  || err "git is required."
command -v npm >/dev/null 2>&1  || err "npm is required."

say "Installing into $PREFIX"
mkdir -p "$PREFIX" "$BIN_DIR"

SRC="$PREFIX/src"
if [ -d "$SRC/.git" ]; then
  say "Updating existing checkout..."
  git -C "$SRC" fetch --depth=1 origin "$REF"
  git -C "$SRC" checkout "$REF"
  git -C "$SRC" reset --hard "origin/$REF"
else
  say "Cloning $REPO @ $REF..."
  rm -rf "$SRC"
  git clone --depth=1 --branch "$REF" "https://github.com/$REPO.git" "$SRC"
fi

say "Installing dependencies..."
( cd "$SRC" && npm install --silent )

say "Building..."
( cd "$SRC" \
  && npm --workspace @betterprompting/db run build \
  && npm --workspace @betterprompting/analyzer run build \
  && npm --workspace @betterprompting/proxy run build \
  && npm --workspace betterprompting run build )

# Wrapper that invokes the CLI with the locked-in node_modules.
cat > "$BIN_DIR/betterprompting" <<EOF
#!/usr/bin/env sh
exec node "$SRC/packages/cli/dist/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/betterprompting"

# Try to symlink into a PATH dir.
TARGET=""
for d in /usr/local/bin "$HOME/.local/bin"; do
  if [ -d "$d" ] && [ -w "$d" ]; then
    TARGET="$d/betterprompting"
    break
  fi
done

if [ -n "$TARGET" ]; then
  ln -sf "$BIN_DIR/betterprompting" "$TARGET"
  say "Installed: $TARGET"
else
  say "Installed to $BIN_DIR/betterprompting"
  say "Add this to your PATH:"
  printf '    export PATH="%s:$PATH"\n' "$BIN_DIR"
fi

say "Done. Next:"
printf "    betterprompting init\n"
printf "    betterprompting            # starts the proxy on :8787\n\n"
printf "Then point your tools at it:\n"
printf "    export ANTHROPIC_BASE_URL=http://127.0.0.1:8787\n"
printf "    export OPENAI_BASE_URL=http://127.0.0.1:8787/v1\n"
