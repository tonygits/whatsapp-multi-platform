# Configuração do Docker Hub para GitHub Actions

## Passos para configurar o deploy automático no Docker Hub

### 1. Configurar Secrets no GitHub

Acesse o repositório no GitHub e vá em **Settings > Secrets and variables > Actions**

Adicione os seguintes secrets:

- `DOCKER_USERNAME`: Seu nome de usuário do Docker Hub
- `DOCKER_PASSWORD`: Sua senha do Docker Hub ou Access Token (recomendado)

### 2. Criar Access Token no Docker Hub (Recomendado)

1. Acesse [Docker Hub](https://hub.docker.com/)
2. Vá em **Account Settings > Security**
3. Clique em **New Access Token**
4. Dê um nome descritivo (ex: "GitHub Actions")
5. Selecione as permissões necessárias
6. Copie o token gerado e use como `DOCKER_PASSWORD`

### 3. Nome da Imagem

O workflow está configurado para usar o formato:
```
docker.io/SEU_USERNAME/whatsapp-multi-platform-api
```

### 4. Tags Automáticas

O workflow criará automaticamente as seguintes tags:
- `latest` - para builds da branch main
- `v1.0.0` - para tags de versão semântica
- `main` - para builds da branch main
- `pr-123` - para pull requests

### 5. Plataformas Suportadas

A imagem será buildada para:
- `linux/amd64`
- `linux/arm64`

### 6. Recursos do Workflow

- ✅ Build multi-arquitetura
- ✅ Cache otimizado do Docker
- ✅ Atualização automática da descrição no Docker Hub
- ✅ Metadados e labels automáticos
- ✅ Segurança: não executa push em pull requests

### 7. Primeiro Deploy

Após configurar os secrets, faça um commit na branch `main` ou crie uma tag para iniciar o primeiro build.

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 8. Monitoramento

Monitore o progresso do build em:
- **Actions** tab do seu repositório GitHub
- **Builds** section do Docker Hub