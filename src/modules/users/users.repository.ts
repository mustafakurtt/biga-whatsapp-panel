// Kullanıcı tablosu, roller ve numara erişimleri.
import type { Database } from "../../db/client";
import { type Permission, parsePermissions } from "../../shared/permissions";
import { sortTr } from "../../shared/sort";
import type { NumberAccess } from "../../shared/types";

export interface NumberGrant {
  numberId: number;
  access: NumberAccess;
}

export interface ManagedUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  active: boolean;
  lastLoginAt: number | null;
  numbers: NumberGrant[];
}

export interface RoleView {
  id: number;
  name: string;
  permissions: Permission[];
  system: boolean;
  userCount: number;
}

type NewUser = { username: string; name: string; passwordHash: string; roleId: number; active: boolean; numbers: NumberGrant[] };
type UserPatch = { name?: string; passwordHash?: string; roleId?: number; active?: boolean; numbers?: NumberGrant[] };

type UserRow = Omit<ManagedUser, "numbers" | "active"> & { active: number };

const USER_SELECT = `SELECT u.id, u.username, u.name, u.role_id AS roleId, r.name AS roleName, u.active, u.last_login_at AS lastLoginAt
  FROM users u JOIN roles r ON r.id = u.role_id`;

export const createUsersRepository = (db: Database) => {
  const numbersOf = (userId: number): NumberGrant[] =>
    db
      .query<NumberGrant, [number]>(
        "SELECT number_id AS numberId, access FROM user_numbers WHERE user_id = ? ORDER BY number_id",
      )
      .all(userId);

  const setNumbers = (userId: number, grants: NumberGrant[]) => {
    db.query("DELETE FROM user_numbers WHERE user_id = ?").run(userId);
    const insert = db.query(
      "INSERT OR REPLACE INTO user_numbers (user_id, number_id, access) SELECT ?, id, ? FROM numbers WHERE id = ?",
    );
    for (const g of grants) insert.run(userId, g.access, g.numberId);
  };

  const view = (row: UserRow): ManagedUser => ({ ...row, active: Boolean(row.active), numbers: numbersOf(row.id) });

  const get = (id: number): ManagedUser | null => {
    const row = db.query<UserRow, [number]>(`${USER_SELECT} WHERE u.id = ?`).get(id);
    return row ? view(row) : null;
  };

  type RoleRow = { id: number; name: string; permissions: string; system: number; userCount: number };
  const roleView = (r: RoleRow): RoleView => ({ ...r, permissions: parsePermissions(r.permissions), system: Boolean(r.system) });
  const ROLE_SELECT = `SELECT r.id, r.name, r.permissions, r.system, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS userCount FROM roles r`;

  return {
    get,
    list: (): ManagedUser[] => sortTr(db.query<UserRow, []>(USER_SELECT).all(), (u) => u.name).map(view),
    usernameTaken: (username: string): boolean =>
      db.query("SELECT 1 FROM users WHERE username = ?").get(username) !== null,
    // Aktif ve Patron rolündeki başka kullanıcı sayısı (son patronu kaybetmeyelim).
    otherActivePatrons: (exceptId: number): number =>
      db
        .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM users WHERE role_id = 1 AND active = 1 AND id != ?")
        .get(exceptId)!.n,
    create: (user: NewUser): number =>
      db.transaction(() => {
        const row = db
          .query<{ id: number }, [string, string, string, number, number, number]>(
            "INSERT INTO users (username, name, password_hash, role_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
          )
          .get(user.username, user.name, user.passwordHash, user.roleId, user.active ? 1 : 0, Date.now())!;
        setNumbers(row.id, user.numbers);
        return row.id;
      })(),
    update: (id: number, patch: UserPatch) =>
      db.transaction(() => {
        if (patch.name !== undefined) db.query("UPDATE users SET name = ? WHERE id = ?").run(patch.name, id);
        if (patch.roleId !== undefined) db.query("UPDATE users SET role_id = ? WHERE id = ?").run(patch.roleId, id);
        if (patch.active !== undefined) db.query("UPDATE users SET active = ? WHERE id = ?").run(patch.active ? 1 : 0, id);
        if (patch.passwordHash) db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(patch.passwordHash, id);
        if (patch.numbers) setNumbers(id, patch.numbers);
      })(),
    remove: (id: number) => db.query("DELETE FROM users WHERE id = ?").run(id),

    roles: (): RoleView[] => db.query<RoleRow, []>(`${ROLE_SELECT} ORDER BY r.system DESC, r.name`).all().map(roleView),
    role: (id: number): RoleView | null => {
      const row = db.query<RoleRow, [number]>(`${ROLE_SELECT} WHERE r.id = ?`).get(id);
      return row ? roleView(row) : null;
    },
    roleByName: (name: string): RoleView | null => {
      const row = db.query<RoleRow, [string]>(`${ROLE_SELECT} WHERE r.name = ? COLLATE NOCASE`).get(name);
      return row ? roleView(row) : null;
    },
    createRole: (name: string, permissions: Permission[]): number =>
      db
        .query<{ id: number }, [string, string, number]>(
          "INSERT INTO roles (name, permissions, created_at) VALUES (?, ?, ?) RETURNING id",
        )
        .get(name, JSON.stringify(permissions), Date.now())!.id,
    updateRole: (id: number, patch: { name?: string; permissions?: Permission[] }) => {
      if (patch.name !== undefined) db.query("UPDATE roles SET name = ? WHERE id = ?").run(patch.name, id);
      if (patch.permissions) db.query("UPDATE roles SET permissions = ? WHERE id = ?").run(JSON.stringify(patch.permissions), id);
    },
    removeRole: (id: number) => db.query("DELETE FROM roles WHERE id = ?").run(id),
  };
};

export type UsersRepository = ReturnType<typeof createUsersRepository>;
