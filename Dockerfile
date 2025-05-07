FROM node:20

# Dependencias de sistema para Chromium
RUN apt-get update && apt-get install -y \
    libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxcb1 libxkbcommon0 \
    libasound2 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libatspi2.0-0 libx11-6 libxcomposite1 libglib2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Fuerza instalación del navegador dentro de node_modules/.local-browsers
ENV PLAYWRIGHT_BROWSERS_PATH=0

WORKDIR /app
COPY . .

RUN npm install && npx playwright install chromium

CMD ["npm", "run", "start"]
