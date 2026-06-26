FROM alpine:3.19

# Instalar dependencias nativas
RUN apk update && \
    apk add --no-cache \
    python3 \
    ffmpeg \
    curl \
    nodejs \
    npm

# Instalar yt-dlp usando un script oficial que descarga el binario ejecutable
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copiar archivos de Node.js e instalar
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código del servidor
COPY server.js .

EXPOSE 3001

CMD ["npm", "start"]
