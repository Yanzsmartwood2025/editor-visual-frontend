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

# Instalar yt-dlp y curl_cffi usando pip
RUN pip install -U yt-dlp curl_cffi --break-system-packages

WORKDIR /app

# Copiar archivos de Node.js e instalar
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código del servidor
COPY server.js .

EXPOSE 3001

CMD ["npm", "start"]
