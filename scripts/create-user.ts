// İlk kullanıcıyı (genelde patron) komut satırından ekler.
// Kullanım: bun run user:create <kullanıcı_adı> <şifre> [ad] [rol]   (rol: patron | temsilci | salt_okunur)
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { readEnv } from "../src/config/env";
import { openDatabase } from "../src/db/client";
import { createUsersRepository } from "../src/modules/users/users.repository";
import type { Role } from "../src/shared/types";

const ROLES: Role[] = ["patron", "temsilci", "salt_okunur"];
const [username, password, name = username, role = "patron"] = process.argv.slice(2);

if (!username || !password || password.length < 6 || !ROLES.includes(role as Role)) {
  console.error("Kullanım: bun run user:create <kullanıcı_adı> <şifre (en az 6)> [ad] [patron|temsilci|salt_okunur]");
  process.exit(1);
}

const db = openDatabase(readEnv().DATABASE_PATH);
const users = createUsersRepository(db);
if (users.usernameTaken(username)) {
  console.error(`"${username}" kullanıcı adı zaten var.`);
  process.exit(1);
}
const id = users.create({ username, name: name!, passwordHash: await hashPassword(password), role: role as Role, numberIds: [] });
console.log(`Kullanıcı eklendi: #${id} ${username} (${role})`);
db.close();
