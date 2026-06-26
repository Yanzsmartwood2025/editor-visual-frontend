FROM node:22-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    curl \
    ca-certificates

# Download and install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

EXPOSE 4000
CMD ["npm", "start"]
