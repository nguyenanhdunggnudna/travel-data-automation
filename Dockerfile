# 1. Base image: Node 22 trên Debian Bullseye
FROM node:22-bullseye

# 2. Set working directory
WORKDIR /usr/src/app

# 3. Copy package.json + package-lock.json
COPY package*.json ./

# 4. Install dependencies
RUN npm install --legacy-peer-deps

# 5. Install Chromium dependencies (cho Puppeteer)
RUN apt-get update && apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc-s1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    xdg-utils \
    wget \
    chromium \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# 6. Set Puppeteer env
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 7. Copy source code
COPY . .

# 8. Copy credentials folder (local credentials -> container)
COPY credentials ./credentials

# 9. Copy .env file (nếu bạn dùng)
COPY .env .env

# 10. Build project
RUN npm run build

# 11. Set NODE_ENV
ENV NODE_ENV=production

# 12. Expose port nếu cần (ví dụ cho API)
# EXPOSE 3000

# 13. Command to run app
CMD ["npm", "run", "prod"]
