# Worker de relevé isolé — une image, une SOURCE au runtime.
# Chromium Playwright, pas Chrome système. Un process = une source.

FROM node:22-bookworm AS bundle
WORKDIR /src
RUN npm install --prefix /opt/esbuild esbuild@0.25.9
COPY src ./src
COPY tools/lib/electron-stub.mjs ./tools/lib/electron-stub.mjs
RUN /opt/esbuild/node_modules/.bin/esbuild \
      src/main/providers/scrapeWorker/server.ts \
      --bundle --platform=node --format=cjs \
      --outfile=/out/worker.cjs \
      --external:playwright \
      --alias:electron=./tools/lib/electron-stub.mjs \
      --alias:@shared=./src/shared

FROM mcr.microsoft.com/playwright:v1.62.1-jammy
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    SKITRACK_SCRAPE_PROFILE=/data/profile \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm init -y >/dev/null && npm install --omit=dev playwright@1.62.1 \
 && mkdir -p /data/profile \
 && chown -R pwuser:pwuser /app /data
COPY --from=bundle /out/worker.cjs /app/worker.cjs
USER pwuser
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "worker.cjs"]
