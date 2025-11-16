# Dev Container Setup

This dev container provides a complete development environment for Llama Coder with all necessary dependencies pre-installed.

## Features

- Node.js 18 LTS
- Yarn package manager (via Corepack)
- Git and essential development tools
- Pre-configured VSCode extensions:
  - ESLint
  - TypeScript
  - Prettier
- Automatic dependency installation on container creation

## Usage

### VS Code

1. Install the "Dev Containers" extension in VS Code
2. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Select "Dev Containers: Reopen in Container"
4. Wait for the container to build and start

### Manual Build

To build the container manually:

```bash
docker build -f .devcontainer/Dockerfile -t llama-coder-dev .
```

To run the container:

```bash
docker run -it -v $(pwd):/workspace llama-coder-dev
```

## Development Commands

Once inside the container, you can use all the standard development commands:

```bash
# Compile TypeScript
yarn compile

# Watch mode for development
yarn watch

# Run linter
yarn lint

# Run tests
yarn test

# Package extension
yarn package
```

## Notes

- Dependencies are installed automatically when the container is created
- The source code is mounted from your host machine, so changes are immediately reflected
- The container runs as the `node` user (non-root) for security
