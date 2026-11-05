# syntax=docker/dockerfile:1
# The public Maison3D demo: the furnish server, its web client, the library's models, and Piper to speak the replies
# (the Quest browser has no voice of its own, and Meta's Model API transcribes but does not speak). No npm dependencies;
# the Meta Model API key comes from the host's secrets (META_API_KEY), never from the image.
FROM node:22-slim
# Piper's last standalone Linux build, and a voice trained on LJ Speech, which is public domain
ADD --checksum=sha256:a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992 https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz /tmp/piper.tgz
ADD --checksum=sha256:6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22 https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx /opt/piper-voice/en_US-ljspeech-medium.onnx
ADD --checksum=sha256:141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860 https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json /opt/piper-voice/en_US-ljspeech-medium.onnx.json
RUN tar -xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz && chmod -R a+rX /opt/piper /opt/piper-voice
WORKDIR /app
COPY package.json ./
COPY mojulo ./mojulo
COPY 70-inventory ./70-inventory
COPY 07-spike-native-furnish ./07-spike-native-furnish
ENV NODE_ENV=production MAISON_PUBLIC=1 PORT=8080 MAISON_PIPER=/opt/piper/piper MAISON_PIPER_VOICE=/opt/piper-voice/en_US-ljspeech-medium.onnx
EXPOSE 8080
USER node
CMD ["node", "07-spike-native-furnish/server.mjs"]
