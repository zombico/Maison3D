# The public Maison3D demo: the furnish server, its web client, the library's models. No build step and no npm
# dependencies; the Meta Model API key comes from the host's secrets (META_API_KEY), never from the image.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY mojulo ./mojulo
COPY 70-inventory ./70-inventory
COPY 07-spike-native-furnish ./07-spike-native-furnish
ENV NODE_ENV=production MAISON_PUBLIC=1 PORT=8080
EXPOSE 8080
USER node
CMD ["node", "07-spike-native-furnish/server.mjs"]
