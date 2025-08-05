#!/bin/sh

echo "🚀 Iniciando WhatsApp Container para número: ${PHONE_NUMBER:-unknown}"

# Set environment variables for the WhatsApp API
export WHATSAPP_API_PORT=${WHATSAPP_API_PORT:-3000}
export WHATSAPP_API_HOST=${WHATSAPP_API_HOST:-0.0.0.0}

# Wait for gateway to be ready
if [ ! -z "$GATEWAY_URL" ]; then
    echo "⏳ Aguardando API Gateway estar pronto..."
    until curl -s "$GATEWAY_URL/api/health" > /dev/null 2>&1; do
        echo "⏳ Gateway não pronto, aguardando 5 segundos..."
        sleep 5
    done
    echo "✅ API Gateway está pronto!"
fi

# Notify gateway that container is starting
if [ ! -z "$GATEWAY_URL" ] && [ ! -z "$PHONE_NUMBER" ]; then
    echo "📞 Notificando Gateway sobre inicialização do container $PHONE_NUMBER"
    curl -s -X POST "$GATEWAY_URL/api/devices/$PHONE_NUMBER/container-started" \
        -H "Content-Type: application/json" \
        -d "{\"port\":$WHATSAPP_API_PORT,\"timestamp\":\"$(date -Iseconds)\"}" || true
fi

echo "🔄 Iniciando go-whatsapp-web-multidevice..."

# Start the WhatsApp API with configuration
exec /app/main \
    --host="$WHATSAPP_API_HOST" \
    --port="$WHATSAPP_API_PORT" \
    --config="/app/config.yml"