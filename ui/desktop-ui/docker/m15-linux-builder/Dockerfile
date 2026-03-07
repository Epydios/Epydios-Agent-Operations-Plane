FROM --platform=linux/amd64 golang:1.25-bookworm

ARG DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dbus-x11 \
    desktop-file-utils \
    file \
    git \
    jq \
    kubernetes-client \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    nodejs \
    npm \
    patchelf \
    pkg-config \
    qemu-user-static \
    xauth \
    xvfb \
    xz-utils \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN GOBIN=/usr/local/bin go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0

RUN curl -fsSL -o /usr/local/bin/appimagetool.AppImage \
    https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage \
  && chmod +x /usr/local/bin/appimagetool.AppImage \
  && printf '#!/usr/bin/env bash\nAPPIMAGE_EXTRACT_AND_RUN=1 exec qemu-x86_64-static /usr/local/bin/appimagetool.AppImage \"$@\"\n' > /usr/local/bin/appimagetool \
  && chmod +x /usr/local/bin/appimagetool

WORKDIR /workspace/agentops-desktop/EPYDIOS_AGENTOPS_DESKTOP_REPO
