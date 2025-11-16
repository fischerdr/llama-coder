# Use Node.js 18 LTS as base image
FROM node:18-bullseye

# Install additional tools that might be useful for development
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        git \
        bash-completion \
        curl \
        ca-certificates \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Enable yarn globally
RUN corepack enable

# Set up workspace
WORKDIR /workspace

# Copy package files for dependency installation
COPY package.json yarn.lock .yarnrc ./

# Install dependencies (this layer will be cached unless package files change)
RUN yarn install --frozen-lockfile

# The source code will be mounted at runtime, so we don't copy it here
# This makes rebuilds faster during development

# Set the default user to node (non-root)
USER node

# Default command
CMD ["/bin/bash"]
