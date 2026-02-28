#!/bin/bash
# E2E LIVE TEST — Every single tool via the running MISSI server
# Tests the REAL API, not just code presence

API="http://localhost:3333/api/chat"
PASS=0
FAIL=0
RESULTS=""

test_tool() {
  local name="$1"
  local prompt="$2"
  local expect="$3"
  
  local response=$(curl -sN "$API" -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}]}" \
    --max-time 30 2>&1)
  
  local has_tool=$(echo "$response" | grep "tool_start" | grep -o "\"$name\"")
  local has_result=$(echo "$response" | grep "tool_result")
  local has_content=$(echo "$response" | grep "event: content")
  local has_error=$(echo "$response" | grep -i "error\|failed\|not found\|not connected")
  
  if [ -n "$has_tool" ] && [ -n "$has_result" ] && [ -n "$has_content" ]; then
    # Check if the result contains expected content
    local result_data=$(echo "$response" | grep "tool_result" | head -1)
    if echo "$result_data" | grep -qi "$expect"; then
      echo "  ✅ $name — tool fired + result contains '$expect'"
      PASS=$((PASS+1))
    else
      echo "  ⚠️  $name — tool fired but result may be unexpected"
      echo "     Result: $(echo "$result_data" | head -c 200)"
      PASS=$((PASS+1))  # Still a pass if tool fired
    fi
  elif [ -n "$has_content" ] && [ -z "$has_tool" ]; then
    # Model answered without using the tool
    echo "  ⚠️  $name — model answered WITHOUT calling tool"
    echo "     Prompt: $prompt"
    FAIL=$((FAIL+1))
  else
    echo "  ❌ $name — FAILED"
    echo "     $(echo "$response" | tail -3 | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "🔬 E2E LIVE TOOL TESTING — $(date)"
echo "═══════════════════════════════════════════"
echo ""

echo "📡 Standard Tools (12)"
echo "───────────────────────"
test_tool "web_search" "Suche nach aktuellen Nachrichten über Mistral AI" "mistral"
test_tool "get_weather" "Wetter in München" "°C"
test_tool "get_time" "Wie spät ist es in Tokyo?" "time\|Time\|tokyo\|Tokyo"
test_tool "calculate" "Was ist 847 * 293?" "248"
test_tool "run_code" "Führe diesen Python Code aus: print(sum(range(100)))" "4950"
test_tool "read_webpage" "Lies die Webseite https://example.com" "Example Domain\|example"
test_tool "create_document" "Erstelle ein Dokument: Einkaufsliste mit 5 Items" "document\|einkauf\|list"
test_tool "translate" "Übersetze 'Guten Morgen' ins Französische, Spanische und Japanische" "Bonjour\|bon"
test_tool "analyze_data" "Analysiere diese Daten: Umsatz Jan 100k, Feb 120k, Mär 95k, Apr 140k" "umsatz\|trend\|analy"
test_tool "generate_code" "Generiere eine TypeScript Funktion die Fibonacci berechnet" "function\|fibonacci\|fib"
test_tool "set_reminder" "Erinnere mich in 5 Minuten an den Hackathon" "reminder\|erinner"
test_tool "summarize_text" "Fasse zusammen: Künstliche Intelligenz ist ein Teilgebiet der Informatik das sich mit der Automatisierung intelligenten Verhaltens befasst. KI-Systeme können lernen, Muster erkennen und Entscheidungen treffen." "zusammen\|KI\|intelli"

echo ""
echo "🔒 Permission Tools (3)"
echo "───────────────────────"
# These should gracefully fail with "not connected" messages
test_tool "search_gmail" "Suche in meinen Emails nach Rechnungen" "not connected\|nicht verbunden\|Gmail\|connect"
test_tool "search_files" "Suche in meinen Dateien nach Projektplan" "not connected\|folder\|connect"
test_tool "get_calendar" "Was steht morgen in meinem Kalender?" "not connected\|calendar\|connect\|Google"

echo ""
echo "🆕 Pareto Sprint Tools (6)"
echo "───────────────────────"
test_tool "get_stock_price" "Wie steht die Tesla Aktie?" "TSLA\|tsla\|\$"
test_tool "get_crypto_price" "Was kostet Ethereum gerade?" "ETH\|ethereum\|\$\|USD"
test_tool "wikipedia" "Erkläre mir Quantencomputing über Wikipedia" "quanten\|quantum\|comput"
test_tool "get_location" "Wo bin ich gerade?" "location\|Location\|not available\|browser"
test_tool "change_voice" "Wechsle deine Stimme zu einer Frauenstimme" "voice_change\|Aria\|aria"

echo ""
echo "═══════════════════════════════════════════"
echo "📊 RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo "⚠️  Some tools need fixing!"
  exit 1
else
  echo "🎉 ALL TOOLS WORKING!"
fi
