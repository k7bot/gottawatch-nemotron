#!/usr/bin/env bash
# One-shot Northflank deploy (free Developer Sandbox): project + secret group + combined service
# (build from GitHub main, deploy with a 1 GB volume at /data). Safe to re-run: existing pieces are kept.
#
# Needs: NF_API_TOKEN (Northflank API token) and NEBIUS_API_KEY in the environment, the Northflank CLI
# (npm i -g @northflank/cli), and GitHub already connected in Northflank with access to
# k7bot/gottawatch-nemotron. Neither secret is ever printed or passed on a command line.
set -euo pipefail
cd "$(dirname "$0")"

# The free Sandbox allows one project; a new account already has "default" (region set on first use).
PROJECT="${NF_PROJECT:-default}"
REGION="${NF_REGION:-us-central}"        # us-east1 rejects free projects; us-central (GCP Iowa) is used
SERVICE=gottawatch
SECRET=nebius-token-factory
NF="${NF_BIN:-northflank}"

NF_API_TOKEN="${NF_API_TOKEN:-${NORTHFLANK_API_TOKEN:-}}"
: "${NF_API_TOKEN:?set NF_API_TOKEN or NORTHFLANK_API_TOKEN (Northflank > Account settings > API > Tokens)}"
: "${NEBIUS_API_KEY:?set NEBIUS_API_KEY (Nebius Token Factory key)}"
export NF_API_TOKEN
command -v "$NF" >/dev/null || { echo "Northflank CLI not found (npm i -g @northflank/cli)"; exit 1; }

nf() { "$NF" "$@" --quiet 2>&1 | grep -v "running on version" || true; }
exists() { "$NF" "$@" --quiet -o json >/dev/null 2>&1; }

echo "1/4 project $PROJECT ($REGION)"
if exists get project --projectId "$PROJECT"; then echo "    exists"; else
  nf create project --input "{\"name\":\"$PROJECT\",\"region\":\"$REGION\",\"description\":\"Gottawatch for the Nebius x NVIDIA Global AI Hackathon\"}"
fi

echo "2/4 GitHub access to k7bot/gottawatch-nemotron"
access=$("$NF" get service repository-access --projectId "$PROJECT" --quiet -o json \
  --input '{"projectUrl":"https://github.com/k7bot/gottawatch-nemotron","projectType":"github"}' 2>&1 || true)
if ! echo "$access" | grep -q '"accessible": *true'; then
  if [ "${SKIP_ACCESS_CHECK:-0}" = "1" ]; then
    echo "    precheck says no access; SKIP_ACCESS_CHECK=1, trying anyway (the precheck can miss team Git links)"
  else
    echo "    no access yet: link GitHub in Northflank (team settings > Git > GitHub) and allow k7bot/gottawatch-nemotron."
    echo "    If the UI already shows the repo linked, rerun with SKIP_ACCESS_CHECK=1."
    exit 2
  fi
fi

echo "3/4 secret group $SECRET (NEBIUS_API_KEY)"
if exists get secret --projectId "$PROJECT" --secretId "$SECRET"; then echo "    exists (not overwritten)"; else
  tmp=$(mktemp --suffix=.json); chmod 600 "$tmp"; trap 'rm -f "$tmp"' EXIT
  node -e 'process.stdout.write(JSON.stringify({name:process.argv[1],description:"Nebius Token Factory key",type:"secret",secretType:"environment",priority:10,secrets:{variables:{NEBIUS_API_KEY:process.env.NEBIUS_API_KEY}}}))' "$SECRET" >"$tmp"
  nf create secret --projectId "$PROJECT" --file "$tmp"
  rm -f "$tmp"
fi

echo "4/4 service $SERVICE (nf-compute-50, 1 GB volume at /data, health /healthz)"
if exists get service --projectId "$PROJECT" --serviceId "$SERVICE"; then echo "    exists"; else
  nf create service combined --projectId "$PROJECT" --file service.json
fi

echo
echo "Build + first deploy take ~5-8 min. Watch:"
echo "  $NF get service build-logs --projectId $PROJECT --serviceId $SERVICE"
echo "  $NF get service logs --projectId $PROJECT --serviceId $SERVICE"
echo "Public URL (ports[].dns):"
"$NF" get service --projectId "$PROJECT" --serviceId "$SERVICE" --quiet -o json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);for(const p of (j.ports||[]))if(p.dns)console.log("  https://"+p.dns)}catch{console.log("  (see the service page in the Northflank UI)")}})'
