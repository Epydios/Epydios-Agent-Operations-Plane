FROM --platform=linux/amd64 golang:1.25-bookworm

ARG DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils-mingw-w64-x86-64 \
    ca-certificates \
    curl \
    file \
    g++-mingw-w64-x86-64 \
    gcc-mingw-w64-x86-64 \
    git \
    jq \
    libgtk-3-dev \
    libsoup-3.0-dev \
    libwebkit2gtk-4.1-dev \
    make \
    mingw-w64-common \
    nodejs \
    npm \
    nsis \
    pkg-config \
    unzip \
    zip \
  && rm -rf /var/lib/apt/lists/*

RUN GOBIN=/usr/local/bin go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0

WORKDIR /workspace/agentops-desktop/EPYDIOS_AGENTOPS_DESKTOP_REPO
