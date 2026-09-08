#!/usr/bin/env bash
# scripts/build-mon.sh — push/event build monitörü (opencode-bm ile kullanım için).
#
# opencode-bm'de completion wakeup YOK (poll-only). Bu wrapper, derleme
# komutunu izler, sonucu sınıflandırır ve bitince/sonuç değişince FİŞEK
# atar (push): JSONL event log + status dosyası + stdout banner + bell +
# notify-send (varsa). bm_start ile arka planda çalıştırılır, sonuç
# bm_output yoklamasına gerek kalmadan olay dosyalarından okunur.
#
# Olaylar: STARTED, HEARTBEAT, STALLED (uyarı), TIMED_OUT, STALLED (ölüm),
#          PASSED (geçti), FAILED (kırıldı: test/derleme hatası),
#          ERROR (sinyal ile ölüm / altyapı hatası), INTERRUPTED.
#
# Olay dizini: --event-dir, yoksa $BUILD_MON_DIR, o da yoksa çalışılan
#   dizindeki ./tmp/build-mon (proje başına olay; script'in kendi
#   reposuna yazılmaz — taşınabilirlik için).
#
# Kullanım:
#   build-mon.sh [--name ID] [--event-dir DIR] [--stall-after SN]
#                [--kill-on-stall] [--kill-grace SN] [--timeout SN]
#                [--heartbeat SN] [--rotate-size BYTES] [--rotate-days N]
#                [--rotate-keep N] -- KOMUT [ARGS...]
#
# Örnek (opencode-bm bm_start içinden):
#   build-mon.sh --name j1 --stall-after 120 --timeout 3600 -- \
#     bash -c 'export CARGO_TARGET_DIR=/root/RGSX/rust-target-sandbox; cd /root/RGSX/manager-rs && cargo build -j 1'
#
# Rotasyon (TASK-122): $NAME.log finalde PASSED→silinir; fail (FAILED/ERROR/
#   TIMED_OUT/STALLED/INTERRUPTED)→$NAME.log.<olay>-<UTCts> arşivlenir.
#   events.jsonl audit-trail'dir, silinmez; startup'ta boyut > --rotate-size
#   (default 10MB, 0=kapalı) veya yaş > --rotate-days (default 30, 0=kapalı)
#   ise events-<UTCts>.jsonl arşivlenir, en yeni --rotate-keep (default 5) tutulur.
#
# Çıkış kodları: derlemenin kodu aynen taşınır; 124=timeout ile öldürüldü,
#   111=stall sonrası öldürüldü, 130/143=monitör kesintiye uğradı.

set -u

NAME="build"
EVENT_DIR="${BUILD_MON_DIR:-$PWD/tmp/build-mon}"
STALL_AFTER=120
KILL_ON_STALL=0
KILL_GRACE=60
TIMEOUT=0
HEARTBEAT=60
POLL=2
ROTATE_SIZE=10485760
ROTATE_DAYS=30
ROTATE_KEEP=5

usage() {
  sed -n '2,35p' "${BASH_SOURCE[0]}"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --event-dir) EVENT_DIR="$2"; shift 2 ;;
    --stall-after) STALL_AFTER="$2"; shift 2 ;;
    --kill-on-stall) KILL_ON_STALL=1; shift ;;
    --kill-grace) KILL_GRACE="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --heartbeat) HEARTBEAT="$2"; shift 2 ;;
    --rotate-size) ROTATE_SIZE="$2"; shift 2 ;;
    --rotate-days) ROTATE_DAYS="$2"; shift 2 ;;
    --rotate-keep) ROTATE_KEEP="$2"; shift 2 ;;
    --) shift; break ;;
    -h|--help) usage ;;
    *) echo "build-mon: bilinmeyen argüman: $1" >&2; usage ;;
  esac
done

[[ $# -eq 0 ]] && { echo "build-mon: komut yok" >&2; usage; }
[[ "$STALL_AFTER" =~ ^[0-9]+$ ]] || { echo "build-mon: --stall-after sayı olmalı" >&2; exit 2; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || { echo "build-mon: --timeout sayı olmalı" >&2; exit 2; }
[[ "$ROTATE_SIZE" =~ ^[0-9]+$ ]] || { echo "build-mon: --rotate-size sayı olmalı" >&2; exit 2; }
[[ "$ROTATE_DAYS" =~ ^[0-9]+$ ]] || { echo "build-mon: --rotate-days sayı olmalı" >&2; exit 2; }
[[ "$ROTATE_KEEP" =~ ^[0-9]+$ ]] || { echo "build-mon: --rotate-keep sayı olmalı" >&2; exit 2; }

mkdir -p "$EVENT_DIR"
# Olay/log dosyaları git'e düşmesin (repo-local kalıcılık için tmp altında).
[[ -f "$EVENT_DIR/.gitignore" ]] || printf '*\n!.gitignore\n' > "$EVENT_DIR/.gitignore"

# --- rotasyon (TASK-122) -------------------------------------------------------
# events.jsonl audit-trail'dir: silinmez, boyut/yaş eşiğinde arşivlenir.
rotate_events() {
  local ev="$EVENT_DIR/events.jsonl"
  [[ -f "$ev" ]] || return 0
  local do_rot=0
  if [[ "$ROTATE_SIZE" -gt 0 ]]; then
    local sz
    sz="$(stat -c%s "$ev" 2>/dev/null || echo 0)"
    [[ "$sz" -gt "$ROTATE_SIZE" ]] && do_rot=1
  fi
  if [[ "$do_rot" -eq 0 && "$ROTATE_DAYS" -gt 0 ]]; then
    local now mtime age
    now="$(date +%s)"
    mtime="$(stat -c%Y "$ev" 2>/dev/null || echo "$now")"
    age=$(( (now - mtime) / 86400 ))
    [[ "$age" -gt "$ROTATE_DAYS" ]] && do_rot=1
  fi
  [[ "$do_rot" -eq 0 ]] && return 0
  local ts arch f i
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  arch="$EVENT_DIR/events-$ts.jsonl"
  mv "$ev" "$arch"
  # keep: en yeni N arşiv tutulur, eskiler silinir.
  i=0
  for f in $(ls -t "$EVENT_DIR"/events-*.jsonl 2>/dev/null); do
    i=$((i + 1))
    [[ "$i" -gt "$ROTATE_KEEP" ]] && rm -f "$f"
  done
}
rotate_events

EVENTS="$EVENT_DIR/events.jsonl"
STATUS="$EVENT_DIR/$NAME.status.json"
RESULT="$EVENT_DIR/$NAME.result"
LOG="$EVENT_DIR/$NAME.log"
: > "$LOG"

CMD_STR="$*"

# --- olay emisyonu -----------------------------------------------------------
# emit OLAY DETAY [EXIT]: JSONL'ye ekler, status.json'u günceller.
emit() {
  local ev="$1" detail="$2" code="${3:-}"
  local ts
  ts="$(date -u +%FT%TZ)"
  BM_TS="$ts" BM_NAME="$NAME" BM_EVENT="$ev" BM_DETAIL="$detail" BM_CODE="$code" \
    BM_LOG="$LOG" python3 -c '
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

# fisek OLAY MESAJ: terminal olaylarda tam push — banner + bell + notify.
fisek() {
  local ev="$1" msg="$2"
  printf '\a'
  printf '<<<\n<<< BUILD-MON [%s] %s: %s\n<<<\n' "$NAME" "$ev" "$msg"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "build-mon [$NAME] $ev" "$msg" 2>/dev/null &
  fi
}

# archive_log OLAY: fail log'u arşivler (sonraki koşumun `: >` sıfırlaması
# delili ezmesin). Arşivden sonra LOG arşivi gösterir (emit'in log alanı doğru olur).
# OLAY küçük harf: failed/error/timed_out/stalled/interrupted.
archive_log() {
  local ev="$1" ts arch
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  arch="$EVENT_DIR/$NAME.log.$ev-$ts"
  mv -f "$LOG" "$arch" 2>/dev/null || true
  LOG="$arch"
}

# --- CPU ölçümü (/proc, grup toplamı) -----------------------------------------
cpu_ticks() {
  # $1 = pgid -> grubun toplam utime+stime (tick). Yoksa 0.
  local pgid="$1" total=0 g pid rest
  while read -r g pid; do
    [[ "$g" == "$pgid" ]] || continue
    rest="$(cat "/proc/$pid/stat" 2>/dev/null)" || continue
    rest="${rest##*) }"
    # rest: state ppid pgrp ... utime($12) stime($13)
    set -- $rest
    total=$((total + ${12:-0} + ${13:-0}))
  done < <(ps -e -o pgid=,pid= 2>/dev/null)
  echo "$total"
}

kill_tree() {
  # $1 = pgid, $2 = sinyal
  local pgid="$1" sig="$2" pid
  kill "-$sig" "-$pgid" 2>/dev/null && return 0
  while read -r g pid; do
    [[ "$g" == "$pgid" ]] || continue
    kill "-$sig" "$pid" 2>/dev/null || true
  done < <(ps -e -o pgid=,pid= 2>/dev/null)
}

# --- derlemeyi başlat (kendi process grubunda) --------------------------------
setsid "$@" >"$LOG" 2>&1 &
BUILD_PID=$!
BUILD_PGID="$(ps -o pgid= -p "$BUILD_PID" 2>/dev/null | tr -d ' ')"
[[ -z "$BUILD_PGID" ]] && BUILD_PGID="$BUILD_PID"

T0=$SECONDS
emit STARTED "komut başladı (pid=$BUILD_PID pgid=$BUILD_PGID): $CMD_STR"
echo "build-mon [$NAME]: izleniyor (pid=$BUILD_PID), log=$LOG"

# Canlı ayna: bm_output'tan anlık takip için stdout'a akıt.
tail -n +1 -F "$LOG" 2>/dev/null &
TAIL_PID=$!

cleanup_tail() { kill "$TAIL_PID" 2>/dev/null || true; }

# Kesinti: ağacı öldür, log'u arşivle, olayı yaz, sinyale uygun kodla çık.
interrupted() {
  cleanup_tail
  kill_tree "$BUILD_PGID" TERM
  archive_log interrupted
  emit INTERRUPTED "monitör kesintiye uğradı, derleme ağacı öldürüldü"
  fisek INTERRUPTED "monitör kesintiye uğradı ($NAME)"
  exit 143
}
trap interrupted INT TERM

# --- watchdog -----------------------------------------------------------------
last_size=0
last_cpu="$(cpu_ticks "$BUILD_PGID")"
silent=0
stalled_flag=0
stalled_before=0
last_hb=$T0
killed_by=""

while kill -0 "$BUILD_PID" 2>/dev/null; do
  sleep "$POLL"
  elapsed=$((SECONDS - T0))

  # Global tavan.
  if [[ "$TIMEOUT" -gt 0 && "$elapsed" -ge "$TIMEOUT" ]]; then
    killed_by="timeout"
    kill_tree "$BUILD_PGID" TERM
    sleep 3
    kill_tree "$BUILD_PGID" KILL
    break
  fi

  size="$(stat -c%s "$LOG" 2>/dev/null || echo 0)"
  cpu="$(cpu_ticks "$BUILD_PGID")"
  if [[ "$size" == "$last_size" && "$cpu" == "$last_cpu" ]]; then
    silent=$((silent + POLL))
  else
    silent=0
    last_size="$size"
    last_cpu="$cpu"
  fi

  # Stall: çıktı da yok, CPU da yok (uzun link/download değil, donma).
  if [[ "$silent" -ge "$STALL_AFTER" && "$stalled_flag" -eq 0 ]]; then
    stalled_flag=1
    stalled_before=1
    emit STALLED "asılı şüphesi: ${silent}sn çıktı+CPU sessizliği (pid=$BUILD_PID)"
    fisek STALLED "asılı şüphesi ($NAME): ${silent}sn sessiz"
  fi
  if [[ "$KILL_ON_STALL" -eq 1 && "$stalled_flag" -eq 1 && "$silent" -ge $((STALL_AFTER + KILL_GRACE)) ]]; then
    killed_by="stall"
    kill_tree "$BUILD_PGID" TERM
    sleep 3
    kill_tree "$BUILD_PGID" KILL
    break
  fi

  if [[ "$HEARTBEAT" -gt 0 && $((elapsed - (last_hb - T0))) -ge "$HEARTBEAT" ]]; then
    last_hb=$SECONDS
    lines="$(wc -l < "$LOG" 2>/dev/null || echo 0)"
    emit HEARTBEAT "${elapsed}sn geçti, log=${lines} satır, cpu=${cpu} tick, sessizlik=${silent}sn"
  fi
done

cleanup_tail
# Ayna yarışını kapatmak için kuyruğu bir kez de doğrudan bas.
sleep 0.3

# --- final sınıflandırma -------------------------------------------------------
if [[ "$killed_by" == "timeout" ]]; then
  wait "$BUILD_PID" 2>/dev/null || true
  archive_log timed_out
  emit TIMED_OUT "tavan aşıldı (${TIMEOUT}sn), ağaç öldürüldü"
  fisek TIMED_OUT "tavan aşıldı ($NAME, ${TIMEOUT}sn)"
  exit 124
fi

if [[ "$killed_by" == "stall" ]]; then
  wait "$BUILD_PID" 2>/dev/null || true
  archive_log stalled
  emit STALLED "asılı kaldı (${silent}sn sessizlik), --kill-on-stall ile öldürüldü" 111
  fisek STALLED "asılı kaldı, öldürüldü ($NAME)"
  exit 111
fi

wait "$BUILD_PID"
CODE=$?
elapsed=$((SECONDS - T0))

if [[ "$CODE" -eq 0 ]]; then
  detail="derleme geçti (${elapsed}sn)"
  [[ "$stalled_before" -eq 1 ]] && detail="$detail [ara stall uyarısı vardı]"
  rm -f "$LOG"
  emit PASSED "$detail" 0
  fisek PASSED "$detail ($NAME)"
  exit 0
fi

# Sinyal ile ölüm -> ERROR (altyapı), yoksa log taramasıyla FAILED (kırıldı).
if [[ "$CODE" -gt 128 ]]; then
  sig=$((CODE - 128))
  signame="$(kill -l "$sig" 2>/dev/null || echo "$sig")"
  archive_log error
  emit ERROR "proses sinyal ile öldü: SIG${signame} (exit=$CODE, ${elapsed}sn)" "$CODE"
  fisek ERROR "sinyal ile öldü: SIG${signame} ($NAME)"
  exit "$CODE"
fi

# Dil/ecosystem bazlı FAILED kanıtı: çıplak "error" taraması warning'lerde
# FP üretir; güçlü sinyal seti + satır-başı error hint'i + tail fallback.
FAIL_SIG='test result: FAILED|FAILED|panicked|failures:|error\[E[0-9]+|npm ERR!|error TS[0-9]+|^FAIL\b|^FAIL:|--- FAIL:|make.*\*\*\* |go: .* failed'
ERR_HINT='^[[:space:]]*error:|^[[:space:]]*error\b'
excerpt="$(grep -m8 -iE "$FAIL_SIG|$ERR_HINT" "$LOG" 2>/dev/null | head -8 | tr '\n' '|')"
if [[ -z "$excerpt" ]]; then
  excerpt="$(tail -n 5 "$LOG" 2>/dev/null | tr '\n' '|')"
fi
if grep -qiE "$FAIL_SIG" "$LOG" 2>/dev/null; then
  detail="testler/derleme KIRILDI (exit=$CODE, ${elapsed}sn) :: ${excerpt:0:400}"
else
  detail="derleme hatayla bitti (exit=$CODE, ${elapsed}sn) :: ${excerpt:0:400}"
fi
[[ "$stalled_before" -eq 1 ]] && detail="$detail [ara stall uyarısı vardı]"
archive_log failed
emit FAILED "$detail" "$CODE"
fisek FAILED "$detail ($NAME)"
exit "$CODE"
