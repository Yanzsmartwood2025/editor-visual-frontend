FROM node:22-bookworm-slim

# Instalar dependencias nativas
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    chromium \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    fontconfig \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN which chromium || echo 'chromium not found'

# Instalar yt-dlp y curl_cffi usando pip
RUN pip install -U yt-dlp curl_cffi --break-system-packages

WORKDIR /app

# Configurar Playwright y Remotion para usar Chromium nativo
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV REMOTION_NO_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copiar archivos de Node.js e instalar
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código del servidor
COPY server.js .
COPY remotion/ ./remotion/

EXPOSE 3001

CMD ["npm", "start"]
