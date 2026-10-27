// Yetki kuralları tek yerde. Arayüz de kontrol eder ama asıl karar burada (sunucuda) verilir.
// patron: tüm numaraları görür, yazar, yönetir. temsilci: atandığı numaraları görür ve yazar.
// salt_okunur: atandığı numaraları sadece görür.
import type { Database } from "../db/client";
import type { Role, SessionUser } from "./types";

export const canWrite = (role: Role): boolean => role === "patron" || role === "temsilci";
export const canManage = (role: Role): boolean => role === "patron";

export const visibleNumberIds = (db: Database, user: SessionUser): number[] => {
  if (user.role === "patron") {
    return db.query<{ id: number }, []>("SELECT id FROM numbers").all().map((r) => r.id);
  }
  return db
    .query<{ number_id: number }, [number]>("SELECT number_id FROM user_numbers WHERE user_id = ?")
    .all(user.id)
    .map((r) => r.number_id);
};

export const canSeeNumber = (db: Database, user: SessionUser, numberId: number): boolean =>
  user.role === "patron" ||
  db.query("SELECT 1 FROM user_numbers WHERE user_id = ? AND number_id = ?").get(user.id, numberId) !== null;

// Bir numarayı görebilen kullanıcı kimlikleri (canlı akış ve push hedefleri için).
export const viewersOfNumber = (db: Database, numberId: number): number[] =>
  db
    .query<{ id: number }, [number]>(
      `SELECT id FROM users WHERE role = 'patron'
       UNION SELECT user_id AS id FROM user_numbers WHERE number_id = ?`,
    )
    .all(numberId)
    .map((r) => r.id);
