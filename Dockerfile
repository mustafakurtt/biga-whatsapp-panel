# syntax=docker/dockerfile:1
# Biga Panel: API (Hono, Bun) + derlenmiş arayüz (web/dist) tek imajda.
# Kurulum ve kullanım: docs/deploy.md
#
# package.json "packageManager": "bun@1.4.3" ile aynı sürüm. Yükseltirken ikisini birlikte değiştirin.
ARG BUN_VERSION=1.4.3

# --- 1) Derleme: tüm bağımlılıklar (dev dahil) + arayüz derlemesi ---
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
# web/vite.config.ts "@shared" takma adıyla src/shared'i kullanır, bu yüzden src de gerekli.
COPY src ./src
COPY web ./web
RUN bun run web:build

# --- 2) Sadece production bağımlılıkları ---
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- 3) Çalışma imajı ---
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/web/dist \
    DATABASE_PATH=/app/data/app.db \
    BAILEYS_AUTH_DIR=/app/data/baileys

# Kod root'a ait ve salt okunur kalır; uygulama yalnızca /app/data'ya yazar.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY --from=build /app/web/dist ./web/dist

# Adlandırılmış birim ilk oluşturulduğunda bu klasörün sahipliğini (bun:bun) devralır.
RUN mkdir -p /app/data && chown bun:bun /app/data && chmod 700 /app/data

# oven/bun imajındaki root olmayan kullanıcı (uid 1000).
USER bun
VOLUME ["/app/data"]
EXPOSE 3000

# İmajda curl yok; sağlık kontrolü Bun'ın fetch'i ile yapılır.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["bun", "src/index.ts"]
