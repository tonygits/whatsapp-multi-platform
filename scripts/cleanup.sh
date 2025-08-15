#!/bin/bash

# Script de limpeza do projeto WhatsApp Multi-Platform API Gateway
# Este script remove arquivos temporários, logs e dados de sessão

echo "🧹 Iniciando limpeza do projeto..."

# Remover sessões do WhatsApp (dados temporários)
if [ -d "sessions" ]; then
    echo "📱 Removendo sessões do WhatsApp..."
    rm -rf sessions/*
    echo "✅ Sessões removidas"
fi

# Remover volumes (bancos SQLite temporários)
if [ -d "volumes" ]; then
    echo "💾 Removendo volumes temporários..."
    rm -rf volumes/*
    echo "✅ Volumes removidos"
fi

# Remover logs
if [ -d "logs" ]; then
    echo "📋 Removendo logs..."
    rm -rf logs/*
    echo "✅ Logs removidos"
fi

# Encontrar e remover arquivos temporários
echo "🗑️ Removendo arquivos temporários..."
find . -name "*.log" -not -path "./node_modules/*" -delete 2>/dev/null
find . -name "*.tmp" -delete 2>/dev/null
find . -name "*.temp" -delete 2>/dev/null
find . -name ".DS_Store" -delete 2>/dev/null
find . -name "Thumbs.db" -delete 2>/dev/null

# Opção para limpar node_modules
read -p "🔄 Deseja limpar e reinstalar node_modules? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Removendo node_modules..."
    rm -rf node_modules package-lock.json
    echo "📥 Reinstalando dependências..."
    npm install
    echo "✅ Dependências reinstaladas"
fi

# Mostrar espaço liberado
echo "📊 Limpeza concluída!"
echo "💾 Espaço em disco:"
du -sh . 2>/dev/null || echo "Não foi possível calcular o tamanho"

echo "🎉 Projeto limpo com sucesso!"