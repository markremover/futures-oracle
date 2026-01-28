# 🔍 Как проверить версию N8N Workflow

## Метод 1: Открыть Execute Order ноду

1. Открой workflow в N8N
2. Кликни на ноду **"Execute Order (Oracle API)"**
3. Посмотри на **HTTP Request Body**:

### ✅ V21 версия (правильная):
```json
{
  "pair": "ETH-USD",
  "signal": "{{ $json.final_signal }}",
  "confidence": "{{ $json.confidence || 'N/A' }}"
}
```

**Признаки V21:**
- ❌ НЕТ `sl_price`
- ❌ НЕТ `tp_price`
- ✅ Только `pair`, `signal`, `confidence`
- ✅ Dynamic values с `{{ }}`

### ❌ V10 версия (старая):
```json
{
  "pair": "ETH-USD",
  "signal": "BUY",
  "sl_price": "3200",
  "tp_price": "3450"
}
```

**Признаки V10:**
- ❌ Есть hardcoded `sl_price`
- ❌ Есть hardcoded `tp_price`

---

## Метод 2: Проверить Telegram ноду

1. Открой ноду **"Telegram (Report)"**
2. Посмотри на **Message Template**:

### ✅ V21 версия:
```
{{ $json.mode === "SIMULATION" ? "🎮 [SIMULATION MODE]" : "💵 [LIVE TRADING]" }}
🚀 **{{ $json.side }} {{ $json.pair }}**

📊 **Entry:** ${{ $json.entry_price }}
🛑 **SL:** ${{ $json.sl_price }}
🎯 **TP:** ${{ $json.tp_price }}

📈 **ATR:** {{ $json.atr }}
📦 **Contracts:** {{ $json.contracts }}
💰 **Risk:** ${{ $json.actual_risk }}
💵 **Margin:** ${{ $json.margin_used }}
⚡ **Leverage:** {{ $json.leverage }}x

{{ $json.mode === "SIMULATION" ? "🎮 **Virtual Balance:** $" + $json.sim_balance + "\n\n" : "" }}
🆔 Order ID: `{{ $json.order_id }}`
```

**Признаки V21:**
- ✅ Есть `{{ $json.mode }}`
- ✅ Есть `{{ $json.sim_balance }}`
- ✅ Есть `{{ $json.leverage }}`

### ❌ V10 версия:
- ❌ Нет `mode`
- ❌ Нет `sim_balance`
- ❌ Нет `leverage`

---

## Метод 3: Посмотреть Workflow Settings

1. Кликни на **три точки** (⋮) справа вверху
2. Выбери **"Settings"**
3. Посмотри **Workflow ID** и **Created/Updated** дату

Если дата сегодняшняя (27 января) - скорее всего V21 ✅

---

## 🚀 Самый простой способ:

**Отправь тестовый сигнал скриптом `test_ghost_sniper.js`!**

Если Telegram отчёт покажет:
- 🎮 [SIMULATION MODE]
- Virtual Balance: $...

Значит **V21 установлена правильно!** ✅
