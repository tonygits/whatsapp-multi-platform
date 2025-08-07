# 🎯 Roadmap

## ✅ v1.0.5 - Recentemente Implementado (Janeiro 2025)
- ✅ **Persistência de sessões** - Sessions sobrevivem a restarts de containers via volume mapping
- ✅ **Auto-restart inteligente** - Recuperação automática de sessões ativas após restart  
- ✅ **QR Code via Base64** - Conversão e servimento direto de QR codes como base64
- ✅ **Database absoluto** - Path absoluto para SQLite garantindo compatibilidade total

### Detalhes Técnicos da v1.0.5
- **Session persistence**: Volume `./sessions:/app/sessions` em docker-compose.yml
- **Auto-restart logic**: `BinaryManager.loadExistingProcesses()` e `restartSessionIfExists()`
- **QR base64**: Middleware `loginHandler.js` intercepta e converte QR codes automaticamente
- **Database path**: Mudança de path relativo para `/app/volumes/whatsapp.db` absoluto

## v1.1.0 - Features Fundamentais
- [ ] **WebSocket em tempo real** - Notificações instantâneas de eventos
- [ ] **Auto-scaling** - Provisionamento automático de processos
- [ ] **Backup automático** - Scripts de backup e restauração
- [ ] **Autenticação JWT** - Sistema de autenticação robusto

## v1.2.0 - UI & Analytics  
- [ ] **Interface Web** - Dashboard completo para gerenciamento
- [ ] **Analytics** - Relatórios e estatísticas detalhadas  
- [ ] **Templates de mensagem** - Sistema de templates reutilizáveis

## v1.3.0 - Integrations
- [ ] **Webhook avançado** - Integração com sistemas externos
- [ ] **Multi-tenancy** - Suporte a múltiplos clientes
- [ ] **API v2** - Versioning e melhorias de performance

## v2.0.0 - Scale & Performance
- [ ] **Redis** - Cache distribuído para alta performance
- [ ] **Clustering** - Balanceamento de carga automático
- [ ] **Kubernetes** - Suporte para orquestração K8s

## Ideias Futuras
- [ ] **Machine Learning** - Auto-resposta inteligente
- [ ] **Voice Messages** - Suporte a áudio
- [ ] **File Management** - Upload/download avançado
- [ ] **Backup Cloud** - Integração com S3/GCS
- [ ] **Monitoring** - Grafana/Prometheus integration

## Como Contribuir

1. Escolha um item do roadmap
2. Abra uma **issue** para discussão
3. Implemente a feature
4. Submeta um **pull request**

Sugestões de novas features são bem-vindas! 🚀