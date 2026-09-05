#!/usr/bin/env bash
# TASK-112 Aşama 1 (v3) — context-saver prune marker TUI görünürlük testi.
# Kullanim: ./cs-marker.sh [--timeout 180] [--session cs-marker-test] [--workdir DIR]
# Exit: 0=PASS (literal marker viewport'ta), 1=FAIL (hicbir iz yok),
#       2=INCONCLUSIVE (TUI hazir olmadi), 3=WEAK-PASS (literal collapsed
#       arkasinda ama marker'a ozgu istatistik `N→M` (or. `10114→150`)
#       LLM alintisinda TUI'da render edildi).
# NOT: zayif kriter bilerek `[0-9]+→[0-9]+` — duz `prun` kelimesi disclosure
# metninden da gelebilir (`auto-pruned by this plugin`), kanit degeri yok.
# Sayisal istatistik sadece dinamik uretilen marker'da var.
set -euo pipefail

TIMEOUT=180
POLL=10
SESSION="cs-marker-test"
WORKDIR="$(mktemp -d /tmp/cs-marker-XXXXXX)"
MARKER='[... pruned:'
WEAK_ERE='[0-9]+→[0-9]+'
PROMPT="Native bash tool kullan. Su komutu aynen calistir: python3 -c \"import sys; sys.stdout.write('Q7'*1000)\". Cikti kac karakter, ne goruyorsun? Ozetle. Tool cagir."
# v3 NOTU: satirsonu-icermeyen 2000-char payload bilincli secim.
# Gerekce (kaynak: opencode-fork2/.../session/index.tsx GenericTool/Shell +
# util/collapse-tool-output.ts): expand SADECE onMouseUp (klavye yolu yok);
# collapse satir-bazli (Shell: 10 satir). Tek-satir payload kirpilinca
# head(1 satir)+marker(1 satir)+tail(1 satir)=~5 satir olur → overflow=false →
# marker viewport'ta gorunur. Cok-satirli seq payload her zaman collapsed
# arkasinda kalir (Kosum 1-3).
LOGFILE="/tmp/cs-marker-$(date +%Y%m%d-%H%M%S).log"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2;;
    --session) SESSION="$2"; shift 2;;
    --workdir) WORKDIR="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

pass() { echo "PASS: $1" | tee -a "$LOGFILE"; exit 0; }
fail() { echo "FAIL: $1" | tee -a "$LOGFILE"; exit 1; }
inconclusive() { echo "INCONCLUSIVE: $1" | tee -a "$LOGFILE"; exit 2; }
weakpass() { echo "WEAK-PASS: $1" | tee -a "$LOGFILE"; exit 3; }

command -v tmux >/dev/null || inconclusive "tmux bulunamadi"
command -v opencode >/dev/null || inconclusive "opencode bulunamadi"
tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

echo "== cs-marker TUI test ==" | tee "$LOGFILE"
echo "session=$SESSION workdir=$WORKDIR timeout=${TIMEOUT}s log=$LOGFILE" | tee -a "$LOGFILE"

# TUI'yi workdir'de baslat (detached). -S -500 scrollback marker viewport disina tasabilir.
tmux new-session -d -s "$SESSION" -c "$WORKDIR" "opencode 2>&1 | tee -a $LOGFILE.session"
sleep 8

# 1) TUI hazir mi? (prompt isareti / opencode banner). Hazir degilse yalan FAIL yok.
ready=0
for ((i=0; i<30; i+=5)); do
  if tmux capture-pane -p -t "$SESSION" -S -100 2>/dev/null | grep -qiE 'opencode|❯|>|prompt|type.*message'; then
    ready=1; break
  fi
  sleep 5
done
[[ "$ready" == "1" ]] || { tmux kill-session -t "$SESSION" 2>/dev/null || true; inconclusive "TUI 30sn'de hazir olmadi"; }

# 2) Buyuk cikti tetikle (LLM roundtrip gerekir — token harcar, CI'ye koyma).
tmux send-keys -t "$SESSION" "$PROMPT" Enter

# 3) Marker icin poll (LLM gecikmesi 20-90sn normal, toplam TIMEOUT).
# Kademeli verdict: literal `[... pruned:` = PASS; yoksa dongu sonunda
# marker-istatistigi `N→M` = WEAK-PASS (hook calisti, TUI collapsed).
elapsed=0
weak_evidence=""
while [[ "$elapsed" -lt "$TIMEOUT" ]]; do
  pane="$(tmux capture-pane -p -t "$SESSION" -S -500 2>/dev/null || true)"
  if printf '%s' "$pane" | grep -qF "$MARKER"; then
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    pass "prune marker TUI'de render edildi (${elapsed}sn)"
  fi
  if [[ -z "$weak_evidence" ]] && printf '%s' "$pane" | grep -qE "$WEAK_ERE"; then
    weak_evidence="$(printf '%s' "$pane" | grep -Eo "$WEAK_ERE" | head -n 1)"
  fi
  sleep "$POLL"
  elapsed=$((elapsed + POLL))
done

tmux kill-session -t "$SESSION" 2>/dev/null || true
if [[ -n "$weak_evidence" ]]; then
  weakpass "literal marker collapsed arkasinda; LLM alintisi TUI'da: ${weak_evidence:0:120}"
fi
fail "marker ${TIMEOUT}sn'de gorunmedi"
