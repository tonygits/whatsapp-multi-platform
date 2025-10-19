# 🐳 Automatic Deployment to Docker Hub

## 📋 Configuration Completed

### GitHub Actions Workflows

1. **`docker-build-push.yml`** - Automatically build and push the Docker image
2. **`release.yml`** - Automatically create releases on GitHub

### 🔧 Required Configuration

#### 1. GitHub Secrets
Configure the following secrets in **Settings > Secrets and variables > Actions**:

```
DOCKER_USERNAME=your_dockerhub_username
DOCKER_PASSWORD=your_token_or_password
```

#### 2. Docker Hub Access Token (Recommended)
- Access [Docker Hub](https://hub.docker.com/)
- Account Settings > Security > New Access Token
- Name: "GitHub" Actions"
- Use the token as `DOCKER_PASSWORD`

### 🚀 How to Use

#### Manual Deploy
```bash
# Push to main
git push origin main

# Or create a tag for release
git tag v1.0.0
git push origin v1.0.0
```

#### Automatic Deploy
- **Push to `main`**: Creates an image with the `latest` tag
- **Tags `v*`**: Creates images with semantic versioning
- **Pull Requests**: Only tests the build (does not push)

### 🏷️ Generated Tags

| Type | Example | Description |
|------|---------|-----------|
| Latest | `latest` | Latest version of main|
| Version | `v1.0.0`, `1.0.0`, `1.0`, `1` | Version tags |
| Branch | `main` | Branch build |
| PR | `pr-123` | Pull request build|

### 📦 Final Image

```bash
# Image Format
docker.io/YOUR_USERNAME/whatsapp-multi-platform-api:TAG

# Examples
docker pull YOUR_USERNAME/whatsapp-multi-platform-api:latest
docker pull YOUR_USERNAME/whatsapp-multi-platform-api:v1.0.0
```

### 🏗️ Build Features

- ✅ **Multi-architecture**: Linux/amd64, Linux/arm64
- ✅ **Optimized Cache**: Faster Build
- ✅ **Automatic Description**: Updates Docker Hub
- ✅ **Metadata**: Labels and Annotations
- ✅ **Security**: Does not run on PRs

### 📊 Monitoring

- **GitHub Actions**: Repository "Actions" tab
- **Docker Hub**: Image "Builds" section

### 🔄 Release Workflow

1. Create tag: `git tag v1.0.0`
2. Push tag: `git push origin v1.0.0`
3. GitHub Actions:
- Build the Docker image
- Create a release on GitHub
- Update Docker Hub

### 🐳 Image Use

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

### ⚡ Next Steps

1. Configure secrets on GitHub
2. Push or create a tag
3. Monitor the build in Actions
4. Check the image on Docker Hub

---

*Automatically configured by Claude for continuous deployment*
