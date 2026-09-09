#!/usr/bin/env bash
# scripts/hbmon-build-mon.sh — build-mon.sh sözleşmesi, hbmon motoru.
#
# build-mon.sh'in olay/dosya/banner sözleşmesini korur (events.jsonl +
# <ad>.status.json [finalde exit alanı] + <ad>.result + stdout banner +
# bell + notify-send), ama izleme motoru olarak hbmon'u kullanır:
# double-fork daemon, UDS `wait --until`, adaptif stall, OOM şüphesi,
# dep-missing. opencode-settle-noticer DEĞİŞMEDEN çalışır (final =
# exit alanlı status kuralı korunur).
#
# build-mon.sh farkları (bilinçli):
#   - Stall eşiği sabit değil, hbmon'un adaptif eşiği (3×p95, min 30s).
#   - Derleme çıktısı adapter log'unda değil, hbmon'un .out'unda yaşar.
#   - OOM ve dep-missing first-class olaylar (build-mon'da yoktu).
#   - Rotasyon hbmon tarafında (JSONL 100MB FIFO cap).
#
# Kullanım:
#   hbmon-build-mon.sh [--name ID] [--event-dir DIR] [--timeout SN]
#       [--kill-on-stall] [--kill-grace SN] [--until LIST] -- KOMUT [ARGS...]
#
# Gereksinim: hbmon ikiliği (HBMON_BIN env veya PATH).
#   cargo install --git https://github.com/aydemir/hbmon
#
# Çıkış kodları build-mon.sh ile aynı: 0 | derleme kodu | 124 timeout |
#   111 stall-kill | 143 kesinti (+137 OOM).

set -u

NAME="build"
EVENT_DIR="${BUILD_MON_DIR:-$PWD/tmp/build-mon}"
TIMEOUT=0
KILL_ON_STALL=0
KILL_GRACE=60
UNTIL="done,failed,dep_missing,stall_suspect,oom_suspect,timeout"
HBMON="${HBMON_BIN:-hbmon}"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --event-dir) EVENT_DIR="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --kill-on-stall) KILL_ON_STALL=1; shift ;;
    --kill-grace) KILL_GRACE="$2"; shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    --) shift; break ;;
    -h|--help) usage ;;
    *) echo "hbmon-build-mon: bilinmeyen argüman: $1" >&2; usage ;;
  esac
done

[[ $# -eq 0 ]] && { echo "hbmon-build-mon: komut yok" >&2; usage; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || { echo "hbmon-build-mon: --timeout sayı olmalı" >&2; exit 2; }
[[ "$KILL_GRACE" =~ ^[0-9]+$ ]] || { echo "hbmon-build-mon: --kill-grace sayı olmalı" >&2; exit 2; }

command -v "$HBMON" >/dev/null 2>&1 || {
  echo "hbmon-build-mon: hbmon bulunamadı (HBMON_BIN=$HBMON)" >&2
  echo "  cargo install --git https://github.com/aydemir/hbmon" >&2
  exit 2
}

mkdir -p "$EVENT_DIR"
[[ -f "$EVENT_DIR/.gitignore" ]] || printf '*\n!.gitignore\n' > "$EVENT_DIR/.gitignore"

EVENTS="$EVENT_DIR/events.jsonl"
STATUS="$EVENT_DIR/$NAME.status.json"
RESULT="$EVENT_DIR/$NAME.result"

# build-mon.sh ile aynı emit/fisek şekli (tüketici sözleşmesi).
emit() {
  local ev="$1" detail="$2" code="${3:-}"
  local ts
  ts="$(date -u +%FT%TZ)"
  BM_TS="$ts" BM_NAME="$NAME" BM_EVENT="$ev" BM_DETAIL="$detail" BM_CODE="$code" \
    BM_LOG="${HBOUT:-}" python3 -c '
import json, os
rec = {"ts": os.environ["BM_TS"], "name": os.environ["BM_NAME"],
       "event": os.environ["BM_EVENT"], "detail": os.environ["BM_DETAIL"],
       "log": os.environ["BM_LOG"]}
if os.environ["BM_CODE"] != "":
    try: rec["exit"] = int(os.environ["BM_CODE"])
    except ValueError: rec["exit"] = os.environ["BM_CODE"]
print(json.dumps(rec, ensure_ascii=False))
' >> "$EVENTS"
  tail -n 1 "$EVENTS" > "$STATUS"
  printf '%s %s: %s\n' "$ts" "$ev" "$detail" > "$RESULT"
}

fisek() {
  local ev="$1" msg="$2"
  printf '\a'
  printf '<<<\n<<< BUILD-MON [%s] %s: %s\n<<<\n' "$NAME" "$ev" "$msg"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "build-mon [$NAME] $ev" "$msg" 2>/dev/null &
  fi
}

# build-mon.sh'in FAILED kanıt seti (ayni — excerpt tutarlılığı için).
FAIL_SIG='test result: FAILED|FAILED|panicked|failures:|error\[E[0-9]+|npm ERR!|error TS[0-9]+|^FAIL\b|^FAIL:|--- FAIL:|make.*\*\*\* |go: .* failed'
excerpt_of() {
  local f="$1" ex
  [[ -f "$f" ]] || { tail -n 0 2>/dev/null; return 0; }
  ex="$(grep -m8 -iE "$FAIL_SIG" "$f" 2>/dev/null | head -8 | tr '\n' '|')"
  [[ -z "$ex" ]] && ex="$(tail -n 5 "$f" 2>/dev/null | tr '\n' '|')"
  printf '%s' "${ex:0:400}"
}

# --- spawn (hbmon daemon) ------------------------------------------------------
# Dikkat: --timeout-sec 0 anında timeout demek; 0 ise bayrak geçilmez.
TFLAG=()
[[ "$TIMEOUT" -gt 0 ]] && TFLAG=(--timeout-sec "$TIMEOUT")
HS="$("$HBMON" watch --detach "${TFLAG[@]}" -- "$@" 2>/dev/null)"
UUID="$(printf '%s' "$HS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["uuid"])' 2>/dev/null)"
[[ -z "${UUID:-}" ]] && { echo "hbmon-build-mon: spawn başarısız (çıktı: $HS)" >&2; exit 3; }
SOCK="$(printf '%s' "$HS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sock"])')"
HBOUT="/tmp/hbmon-$UUID.out"
CMD_STR="$*"
T0=$SECONDS

emit STARTED "komut başladı (hbmon uuid=$UUID): $CMD_STR"
echo "hbmon-build-mon [$NAME]: izleniyor (uuid=$UUID), out=$HBOUT"

SOCK_GONE=0
interrupted() {
  [[ "$SOCK_GONE" == 1 ]] || "$HBMON" shutdown --sock "$SOCK" >/dev/null 2>&1 || true
  emit INTERRUPTED "monitör kesintiye uğradı, daemon kapatıldı"
  fisek INTERRUPTED "monitör kesintiye uğradı ($NAME)"
  exit 143
}
trap interrupted INT TERM

# --- bekleme döngüsü (erken sinyaller uyarı, terminaller final) ----------------
TMPW="$(mktemp)"
warned_stall=0
warned_oom=0
warned_dep=0
while true; do
  elapsed=$((SECONDS - T0))
  if [[ "$TIMEOUT" -gt 0 ]]; then
    REM=$((TIMEOUT - elapsed))
    [[ "$REM" -le 0 ]] && REM=1
    [[ "$REM" -gt 600 ]] && REM=600
  else
    REM=600
  fi
  "$HBMON" wait --sock "$SOCK" --timeout "$REM" --until "$UNTIL" >"$TMPW" 2>/dev/null
  WCODE=$?
  WOKE="$(python3 -c 'import json; print(json.load(open("'$TMPW'")).get("woke_on",""))' 2>/dev/null)"
  STATE="$(python3 -c 'import json; print(json.load(open("'$TMPW'")).get("state",""))' 2>/dev/null)"
  CODE="$(python3 -c 'import json; d=json.load(open("'$TMPW'")); print(d.get("code",""))' 2>/dev/null)"
  elapsed=$((SECONDS - T0))

  case "$WOKE" in
    stall_suspect)
      if [[ "$warned_stall" -eq 0 ]]; then
        warned_stall=1
        emit STALLED "asılı şüphesi (hbmon adaptif eşik, ${elapsed}sn) ($NAME)"
        fisek STALLED "asılı şüphesi ($NAME)"
      fi
      if [[ "$KILL_ON_STALL" -eq 1 ]]; then
        "$HBMON" kill --sock "$SOCK" --signal TERM >/dev/null 2>&1 || true
        sleep "$KILL_GRACE"
        "$HBMON" kill --sock "$SOCK" --signal KILL >/dev/null 2>&1 || true
        emit STALLED "asılı kaldı, --kill-on-stall ile öldürüldü" 111
        fisek STALLED "asılı kaldı, öldürüldü ($NAME)"
        rm -f "$TMPW"
        exit 111
      fi
      continue
      ;;
    oom_suspect)
      if [[ "$warned_oom" -eq 0 ]]; then
        warned_oom=1
        emit OOM_SUSPECT "OOM şüphesi (hbmon, ${elapsed}sn) ($NAME)"
        fisek OOM_SUSPECT "OOM şüphesi ($NAME)"
      fi
      continue
      ;;
    dep_missing)
      # Ara uyarı (build-mon'da yoktu): terminal sınıflandırma için beklenir.
      if [[ "$STATE" != "failed" && "$STATE" != "dep_missing" && -z "$CODE" ]]; then
        if [[ "$warned_dep" -eq 0 ]]; then
          warned_dep=1
          emit DEP_MISSING "bağımlılık eksik şüphesi (hbmon pattern) ($NAME)"
          fisek DEP_MISSING "bağımlılık eksik şüphesi ($NAME)"
        fi
        continue
      fi
      ;;
  esac

  # --- terminal sınıflandırma (build-mon.sh ile aynı harita) -------------------
  if [[ "$WOKE" == "timeout" || "$STATE" == "timeout" ]]; then
    emit TIMED_OUT "tavan aşıldı (${TIMEOUT}sn)" 124
    fisek TIMED_OUT "tavan aşıldı ($NAME, ${TIMEOUT}sn)"
    rm -f "$TMPW"
    exit 124
  fi
  if [[ "$STATE" == "done" || "$CODE" == "0" ]]; then
    emit PASSED "derleme geçti (${elapsed}sn)" 0
    fisek PASSED "derleme geçti (${elapsed}sn) ($NAME)"
    rm -f "$TMPW"
    exit 0
  fi
  RAW="$(python3 -c 'import json; d=json.load(open("'$TMPW'")); print(d.get("exit_event",{}).get("raw_code",""))' 2>/dev/null)"
  if [[ "$RAW" -gt 128 ]] 2>/dev/null; then
    sig=$((RAW - 128))
    signame="$(kill -l "$sig" 2>/dev/null || echo "$sig")"
    emit ERROR "proses sinyal ile öldü: SIG${signame} (exit=$RAW, ${elapsed}sn)" "$RAW"
    fisek ERROR "sinyal ile öldü: SIG${signame} ($NAME)"
    rm -f "$TMPW"
    exit "$RAW"
  fi
  if [[ "$WOKE" == "oom_suspect" || "$STATE" == "oom_killed" ]]; then
    emit ERROR "OOM killer şüphesi (hbmon, ${elapsed}sn)" 137
    fisek ERROR "OOM şüphesi ($NAME)"
    rm -f "$TMPW"
    exit 137
  fi
  ex="$(excerpt_of "$HBOUT")"
  detail="derleme hatayla bitti (exit=${CODE:-?}, ${elapsed}sn) :: $ex"
  emit FAILED "$detail" "${CODE:-1}"
  fisek FAILED "$detail ($NAME)"
  rm -f "$TMPW"
  exit "${CODE:-1}"
done
