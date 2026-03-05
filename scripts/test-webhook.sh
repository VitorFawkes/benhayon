#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Teste E2E do evolution-webhook
# Roda 4 cenários e verifica que somente mensagens válidas são salvas.
# Uso: ./scripts/test-webhook.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

API="https://mbrfqgdqbcedoianjrsr.supabase.co"
KEY="$SUPABASE_SERVICE_ROLE_KEY"
WEBHOOK="$API/functions/v1/evolution-webhook"
REST="$API/rest/v1"
PASS=0
FAIL=0
TS=$(date +%s)

send() {
  curl -sf -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d "$1" > /dev/null
}

count_msgs() {
  curl -s "$REST/message_logs?external_message_id=like.test_${TS}_*&select=id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | \
    python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
}

cleanup() {
  # Delete processing_queue entries first (FK)
  local IDS
  IDS=$(curl -s "$REST/message_logs?external_message_id=like.test_${TS}_*&select=id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | \
    python3 -c "import sys,json; ids=json.load(sys.stdin); print(','.join(i['id'] for i in ids) if ids else '')")
  if [ -n "$IDS" ]; then
    curl -s -X DELETE "$REST/processing_queue?message_log_id=in.($IDS)" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: return=minimal" > /dev/null
  fi
  curl -s -X DELETE "$REST/message_logs?external_message_id=like.test_${TS}_*" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: return=minimal" > /dev/null
}

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name (expected=$expected actual=$actual)"
    FAIL=$((FAIL+1))
  fi
}

trap cleanup EXIT

echo "Testing evolution-webhook (ts=$TS)"
echo ""

# 1) Mensagem válida de paciente conhecido
echo "1. Mensagem válida de paciente conhecido"
send "{\"event\":\"messages.upsert\",\"instance\":\"benhayon_e688b9fb\",\"data\":{\"key\":{\"id\":\"test_${TS}_valid\",\"fromMe\":false,\"remoteJid\":\"5511964293533@s.whatsapp.net\"},\"message\":{\"conversation\":\"teste e2e\"}}}"
TOTAL=$(count_msgs)
check "Mensagem salva" "1" "$TOTAL"

# 2) Grupo (não deve salvar)
echo "2. Mensagem de grupo"
send "{\"event\":\"messages.upsert\",\"instance\":\"benhayon_e688b9fb\",\"data\":{\"key\":{\"id\":\"test_${TS}_group\",\"fromMe\":false,\"remoteJid\":\"5511989270946-1568382367@g.us\"},\"message\":{\"conversation\":\"grupo\"}}}"
TOTAL=$(count_msgs)
check "Grupo filtrado" "1" "$TOTAL"

# 3) Número desconhecido (não deve salvar)
echo "3. Número desconhecido"
send "{\"event\":\"messages.upsert\",\"instance\":\"benhayon_e688b9fb\",\"data\":{\"key\":{\"id\":\"test_${TS}_unknown\",\"fromMe\":false,\"remoteJid\":\"5511999999999@s.whatsapp.net\"},\"message\":{\"conversation\":\"desconhecido\"}}}"
TOTAL=$(count_msgs)
check "Desconhecido filtrado" "1" "$TOTAL"

# 4) fromMe (não deve salvar)
echo "4. Mensagem fromMe"
send "{\"event\":\"messages.upsert\",\"instance\":\"benhayon_e688b9fb\",\"data\":{\"key\":{\"id\":\"test_${TS}_fromme\",\"fromMe\":true,\"remoteJid\":\"5511964293533@s.whatsapp.net\"},\"message\":{\"conversation\":\"enviada\"}}}"
TOTAL=$(count_msgs)
check "fromMe filtrado" "1" "$TOTAL"

# 5) Sem patient_id null
echo "5. Nenhuma mensagem com patient_id null"
NULL_COUNT=$(curl -s "$REST/message_logs?patient_id=is.null&external_message_id=like.test_${TS}_*&select=id" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | \
  python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Zero patient_id null" "0" "$NULL_COUNT"

echo ""
echo "─────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL TESTS PASSED ✓" || echo "SOME TESTS FAILED ✗"
exit "$FAIL"
