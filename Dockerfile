FROM node:20-slim

# Install system dependencies needed by Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libxkbcommon0 libgtk-3-0 libasound2 \
    libgbm1 libxcomposite1 libxdamage1 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Install Playwright Chromium (and dependencies)
RUN npx playwright install chromium --with-deps

# Copy application code
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]