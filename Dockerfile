FROM node:22-slim

COPY . /app
WORKDIR /app
RUN yarn install
RUN yarn run build

CMD ["yarn", "node", "dist/main.js"]
EXPOSE 3000
