FROM node:20-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package.json ./
RUN npm install --omit=dev

# Копируем весь проект
COPY . .

# Запускаем API сервер (Mini App) и бота параллельно
CMD sh -c "node server.js & node bot.js"