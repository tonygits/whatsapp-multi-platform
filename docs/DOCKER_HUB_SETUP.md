# Docker Hub Configuration for GitHub Actions

## Steps to configure automatic deployment on Docker Hub

### 1. Configure Secrets on GitHub

Access the repository on GitHub and go to **Settings > Secrets and variables > Actions**

Add the following secrets:

- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub password or Access Token (recommended)

### 2. Create an Access Token on Docker Hub (recommended)

1. Access [Docker Hub](https://hub.docker.com/)
2. Go to **Account Settings > Security**
3. Click **New Access Token**
4. Give it a descriptive name (e.g., "GitHub Actions")
5. Select the necessary permissions
6. Copy the generated token and use it as `DOCKER_PASSWORD`

### 3. Image Name

The workflow is configured to use the format:
```
docker.io/YOUR_USERNAME/whatsapp-multi-platform-api
```

### 4. Automatic Tags

The workflow will automatically create the following tags:
- `latest` - for builds from the main branch
- `v1.0.0` - for semantic version tags
- `main` - for builds from the main branch
- `pr-123` - for pull requests

### 5. Supported Platforms

The image will be built for:
- `linux/amd64`
- `linux/arm64`

### 6. Workflow Features

- ✅ Multi-architecture build
- ✅ Optimized Docker cache
- ✅ Automatic description update on Docker Hub
- ✅ Automatic metadata and labels
- ✅ Security: does not push on pull requests

### 7. First Deployment

After configuring the secrets, commit to the `main` branch or create a tag to start the first build.

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 8. Monitoring

Monitor build progress in:
- **Actions** tab of your GitHub repository
- **Builds** section of Docker Hub
- 
