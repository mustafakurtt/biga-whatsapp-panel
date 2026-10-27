// Yetki kuralları tek yerde. Arayüz de kontrol eder ama asıl karar burada (sunucuda) verilir.
// Numara erişimi: `numbers.view_all` → tüm numaralar; yoksa user_numbers atamaları.
// `write` sadece kullanıcıda `messages.send` varsa geçerlidir, yoksa `read` sayılır.
import type { Database } from "../db/client";
import { type Permission, parsePermissions } from "./permissions";
import type { NumberAccess, SessionUser } from "./types";

export const has = (user: SessionUser, permission: Permission): boolean => user.permissions.includes(permission);

const effective = (user: SessionUser, assigned: NumberAccess): NumberAccess =>
  assigned === "write" && has(user, "messages.send") ? "write" : "read";

// Kullanıcının görebildiği numaralar ve erişim seviyesi.
export const numberAccessMap = (db: Database, user: SessionUser): Map<number, NumberAccess> => {
  if (has(user, "numbers.view_all")) {
    const level: NumberAccess = has(user, "messages.send") ? "write" : "read";
    return new Map(
      db
        .query<{ id: number }, []>("SELECT id FROM numbers")
        .all()
        .map((r) => [r.id, level]),
    );
  }
  return new Map(
    db
      .query<{ number_id: number; access: NumberAccess }, [number]>(
        "SELECT number_id, access FROM user_numbers WHERE user_id = ?",
      )
      .all(user.id)
      .map((r) => [r.number_id, effective(user, r.access)]),
  );
};

export const visibleNumberIds = (db: Database, user: SessionUser): number[] => [...numberAccessMap(db, user).keys()];

// null: göremez.
export const accessTo = (db: Database, user: SessionUser, numberId: number): NumberAccess | null => {
  if (has(user, "numbers.view_all")) return has(user, "messages.send") ? "write" : "read";
  const row = db
    .query<{ access: NumberAccess }, [number, number]>(
      "SELECT access FROM user_numbers WHERE user_id = ? AND number_id = ?",
    )
    .get(user.id, numberId);
  return row ? effective(user, row.access) : null;
};

export const canSeeNumber = (db: Database, user: SessionUser, numberId: number): boolean =>
  accessTo(db, user, numberId) !== null;

export const canWriteNumber = (db: Database, user: SessionUser, numberId: number): boolean =>
  accessTo(db, user, numberId) === "write";

// Bir numarayı görebilen aktif kullanıcı kimlikleri (canlı akış ve push hedefleri için).
export const viewersOfNumber = (db: Database, numberId: number): number[] => {
  const assigned = new Set(
    db
      .query<{ user_id: number }, [number]>("SELECT user_id FROM user_numbers WHERE number_id = ?")
      .all(numberId)
      .map((r) => r.user_id),
  );
  return db
    .query<{ id: number; permissions: string }, []>(
      "SELECT u.id, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.active = 1",
    )
    .all()
    .filter((u) => assigned.has(u.id) || parsePermissions(u.permissions).includes("numbers.view_all"))
    .map((u) => u.id);
};
