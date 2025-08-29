# Configuração de Backup Automático

## Variáveis de Ambiente

### Configurações Básicas

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `BACKUP_ENABLED` | `false` | Habilita/desabilita o sistema de backup automático |
| `BACKUP_SCHEDULE` | `0 2 * * *` | Cronograma do backup (formato cron) - padrão: 2h da manhã todos os dias |
| `BACKUP_TIMEZONE` | `America/Sao_Paulo` | Fuso horário para execução dos backups |
| `BACKUP_MAX_BACKUPS` | `3` | Número máximo de backups a manter (versões mais antigas são removidas) |
| `BACKUP_STOP_INSTANCES` | `false` | Para instâncias antes do backup para maior segurança dos dados |

### Configurações do S3

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `BACKUP_S3_BUCKET` | - | Nome do bucket S3 (obrigatório) |
| `BACKUP_S3_REGION` | `us-east-1` | Região do S3 |
| `BACKUP_S3_ACCESS_KEY` | - | Access Key do S3 (obrigatório) |
| `BACKUP_S3_SECRET_KEY` | - | Secret Key do S3 (obrigatório) |
| `BACKUP_S3_ENDPOINT` | - | Endpoint customizado S3 (opcional - para S3 compatível) |

### Configurações de Compressão e Segurança

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `BACKUP_COMPRESSION_LEVEL` | `6` | Nível de compressão (1-9, onde 9 é máxima compressão) |
| `BACKUP_ENCRYPTION_KEY` | - | Chave para criptografia AES-256 (opcional) |

## Exemplo de Configuração

```bash
# .env
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_TIMEZONE=America/Sao_Paulo
BACKUP_MAX_BACKUPS=3
BACKUP_STOP_INSTANCES=true

# S3 Configuration
BACKUP_S3_BUCKET=my-whatsapp-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
BACKUP_S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Security
BACKUP_COMPRESSION_LEVEL=6
BACKUP_ENCRYPTION_KEY=minha-chave-super-secreta-256-bits
```

## Cronogramas de Backup Comuns

| Expressão Cron | Descrição |
|----------------|-----------|
| `0 2 * * *` | Todos os dias às 2h |
| `0 2 * * 0` | Domingos às 2h |
| `0 */6 * * *` | A cada 6 horas |
| `0 2 1 * *` | No primeiro dia do mês às 2h |

## Endpoints da API

### GET /api/backup/status
Retorna o status atual do sistema de backup.

### POST /api/backup/trigger
Executa um backup manual imediatamente.

### GET /api/backup/list
Lista todos os backups disponíveis no S3.

### POST /api/backup/restore
Restaura um backup específico.

```json
{
  "backupKey": "backups/whatsapp-data-backup-2025-08-29T05-00-00-000Z.tar.gz"
}
```

## Estrutura dos Backups

Os backups são salvos no S3 com a seguinte estrutura:

```
s3://meu-bucket/
├── backups/
│   ├── whatsapp-data-backup-2025-08-29T02-00-00-000Z.tar.gz
│   ├── whatsapp-data-backup-2025-08-29T02-00-00-000Z.tar.gz.metadata.json
│   ├── whatsapp-data-backup-2025-08-28T02-00-00-000Z.tar.gz
│   ├── whatsapp-data-backup-2025-08-28T02-00-00-000Z.tar.gz.metadata.json
│   └── ...
```

### Metadados do Backup

Cada backup inclui um arquivo de metadados JSON:

```json
{
  "timestamp": "2025-08-29T02:00:00.000Z",
  "size": 1048576,
  "checksum": "sha256:abc123...",
  "compressed": true,
  "encrypted": true,
  "version": "1.0.0"
}
```

## Segurança

- **Criptografia**: Use `BACKUP_ENCRYPTION_KEY` para criptografar backups
- **Acesso S3**: Configure IAM policies restritivas
- **Credenciais**: Mantenha as chaves S3 seguras
- **Rede**: Use HTTPS/TLS para todas as transferências

## Monitoramento

- Logs detalhados em `/logs/app.log`
- WebSocket notifications para status de backup
- Métricas via endpoint `/api/backup/status`

## Restauração

⚠️ **ATENÇÃO**: A restauração substitui completamente a pasta `data` atual. Um backup da pasta atual é criado antes da restauração como medida de segurança.

## Troubleshooting

### Erro: "BACKUP_S3_BUCKET não está configurado"
Configure a variável `BACKUP_S3_BUCKET` com o nome do seu bucket S3.

### Erro: "Falha ao conectar com S3"
Verifique as credenciais e a conectividade com a AWS.

### Backup falha durante compressão
Verifique se há espaço em disco suficiente na pasta `temp`.

### Criptografia falha
Verifique se `BACKUP_ENCRYPTION_KEY` tem pelo menos 32 caracteres.
