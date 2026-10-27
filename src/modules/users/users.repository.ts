// Kullanıcı tablosu ve numara atamaları.
import type { Database } from "../../db/client";
import type { Role } from "../../shared/types";

interface UserView {
  id: number;
  username: string;
  name: string;
  role: Role;
  numberIds: number[];
}

type NewUser = { username: string; name: string; passwordHash: string; role: Role; numberIds: number[] };
type UserPatch = { name?: string; passwordHash?: string; role?: Role; numberIds?: number[] };

export const createUsersRepository = (db: Database) => {
  const numbersOf = (userId: number): number[] =>
    db
      .query<{ number_id: number }, [number]>("SELECT number_id FROM user_numbers WHERE user_id = ? ORDER BY number_id")
      .all(userId)
      .map((r) => r.number_id);

  const setNumbers = (userId: number, ids: number[]) => {
    db.query("DELETE FROM user_numbers WHERE user_id = ?").run(userId);
    const insert = db.query("INSERT OR IGNORE INTO user_numbers (user_id, number_id) SELECT ?, id FROM numbers WHERE id = ?");
    for (const id of new Set(ids)) insert.run(userId, id);
  };

  const get = (id: number): UserView | null => {
    const row = db
      .query<Omit<UserView, "numberIds">, [number]>("SELECT id, username, name, role FROM users WHERE id = ?")
      .get(id);
    return row ? { ...row, numberIds: numbersOf(row.id) } : null;
  };

  return {
    get,
    list: (): UserView[] =>
      db
        .query<Omit<UserView, "numberIds">, []>("SELECT id, username, name, role FROM users ORDER BY name")
        .all()
        .map((row) => ({ ...row, numberIds: numbersOf(row.id) })),
    usernameTaken: (username: string): boolean =>
      db.query("SELECT 1 FROM users WHERE username = ?").get(username) !== null,
    create: (user: NewUser): number =>
      db.transaction(() => {
        const row = db
          .query<{ id: number }, [string, string, string, Role, number]>(
            "INSERT INTO users (username, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
          )
          .get(user.username, user.name, user.passwordHash, user.role, Date.now());
        const id = row!.id;
        setNumbers(id, user.numberIds);
        return id;
      })(),
    update: (id: number, patch: UserPatch) =>
      db.transaction(() => {
        if (patch.name) db.query("UPDATE users SET name = ? WHERE id = ?").run(patch.name, id);
        if (patch.role) db.query("UPDATE users SET role = ? WHERE id = ?").run(patch.role, id);
        if (patch.passwordHash) db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(patch.passwordHash, id);
        if (patch.numberIds) setNumbers(id, patch.numberIds);
      })(),
    remove: (id: number) => db.query("DELETE FROM users WHERE id = ?").run(id),
  };
};
