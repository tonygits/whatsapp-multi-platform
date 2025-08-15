# 🐳 Deploy Automático para Docker Hub

## 📋 Configuração Realizada

### GitHub Actions Workflows

1. **`docker-build-push.yml`** - Build e push automático da imagem Docker
2. **`release.yml`** - Criação automática de releases no GitHub

### 🔧 Configuração Necessária

#### 1. Secrets do GitHub
Configure os seguintes secrets em **Settings > Secrets and variables > Actions**:

```
DOCKER_USERNAME=seu_usuario_dockerhub
DOCKER_PASSWORD=seu_token_ou_senha
```

#### 2. Access Token Docker Hub (Recomendado)
- Acesse [Docker Hub](https://hub.docker.com/)
- Account Settings > Security > New Access Token
- Nome: "GitHub Actions"
- Use o token como `DOCKER_PASSWORD`

### 🚀 Como Usar

#### Deploy Manual
```bash
# Fazer push na main
git push origin main

# Ou criar uma tag para release
git tag v1.0.0
git push origin v1.0.0
```

#### Deploy Automático
- **Push na `main`**: Cria imagem com tag `latest`
- **Tags `v*`**: Cria imagens com versioning semântico
- **Pull Requests**: Apenas testa o build (não faz push)

### 🏷️ Tags Geradas

| Tipo | Exemplo | Descrição |
|------|---------|-----------|
| Latest | `latest` | Última versão da main |
| Versão | `v1.0.0`, `1.0.0`, `1.0`, `1` | Tags de versão |
| Branch | `main` | Build da branch |
| PR | `pr-123` | Build de pull request |

### 📦 Imagem Final

```bash
# Formato da imagem
docker.io/SEU_USERNAME/whatsapp-multi-platform-api:TAG

# Exemplos
docker pull SEU_USERNAME/whatsapp-multi-platform-api:latest
docker pull SEU_USERNAME/whatsapp-multi-platform-api:v1.0.0
```

### 🏗️ Recursos do Build

- ✅ **Multi-arquitetura**: linux/amd64, linux/arm64
- ✅ **Cache otimizado**: Build mais rápido
- ✅ **Descrição automática**: Atualiza Docker Hub
- ✅ **Metadados**: Labels e anotações
- ✅ **Segurança**: Não executa em PRs

### 📊 Monitoramento

- **GitHub Actions**: Tab "Actions" do repositório
- **Docker Hub**: Seção "Builds" da imagem

### 🔄 Workflow de Release

1. Criar tag: `git tag v1.0.0`
2. Push da tag: `git push origin v1.0.0`
3. GitHub Actions:
   - Builda imagem Docker
   - Cria release no GitHub
   - Atualiza Docker Hub

### 🐳 Uso da Imagem

```yaml
# docker-compose.yml
version: '3.8'
services:
  whatsapp-api:
    image: SEU_USERNAME/whatsapp-multi-platform-api:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./sessions:/app/sessions
      - ./volumes:/app/volumes
```

### ⚡ Próximos Passos

1. Configure os secrets no GitHub
2. Faça um push ou crie uma tag
3. Monitore o build no Actions
4. Verifique a imagem no Docker Hub

---

*Configurado automaticamente pelo Claude para deploy contínuo*