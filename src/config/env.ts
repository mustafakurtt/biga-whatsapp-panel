// Ortamın okunduğu tek yer. Diğer dosyalar process.env okumaz, buradan gelen `Env` nesnesini alır.
import { createEnv, envBoolean } from "@mustafakurtt/hono-core/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_PATH: z.string().default("./data/app.db"),
  JWT_SECRET: z.string().min(32, "en az 32 karakter olmalı"),
  COOKIE_SECURE: envBoolean(false),
  // Yeni numaranın varsayılan türü. baileys: gerçek WhatsApp (sunucuya bağlı cihaz). mock: WhatsApp'sız test numarası.
  PROVIDER: z.enum(["baileys", "mock"]).default("baileys"),
  // Test (mock) numaralarına izin: boş bırakılırsa production dışında açık. PROVIDER=mock ise her zaman açık.
  ALLOW_MOCK: z.enum(["true", "false", ""]).default(""),
  // Her numaranın WhatsApp oturum dosyaları burada (numara başına bir klasör). Gizli tutulmalı.
  BAILEYS_AUTH_DIR: z.string().default("./data/baileys"),
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
});

export type Env = z.infer<typeof schema>;

export const parseEnv = (source: Record<string, string | undefined>): Env =>
  createEnv(schema, { source, intro: "Ortam değişkenleri geçersiz:" });

export const readEnv = (): Env => parseEnv(process.env);

export const mockAllowed = (env: Env): boolean =>
  env.PROVIDER === "mock" || (env.ALLOW_MOCK === "" ? env.NODE_ENV !== "production" : env.ALLOW_MOCK === "true");
