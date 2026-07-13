FROM alpine:3.19

# Instalar dependencias nativas
RUN apk update && \
    apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    nodejs \
    npm \
    deno \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

RUN which chromium || which chromium-browser || echo 'chromium not found'

# Instalar yt-dlp y curl_cffi usando pip
RUN pip install -U yt-dlp curl_cffi --break-system-packages

WORKDIR /app

# Dependencias adicionales para Chromium headless en Alpine (fontconfig, dbus, etc)
RUN apk add --no-cache fontconfig dbus mesa-gl

# Configurar Playwright y Remotion para usar Chromium nativo
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV REMOTION_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copiar archivos de Node.js e instalar
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código del servidor
COPY server.js .
COPY remotion/ ./remotion/

EXPOSE 3001

CMD ["npm", "start"]
