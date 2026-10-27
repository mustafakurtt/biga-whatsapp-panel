// Kullanıcıyı komut satırından ekler (ilk Patron hesabı için).
// Kullanım: bun run user:create <kullanıcı_adı> <şifre> [ad] [rol adı, varsayılan "Patron"]
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { readEnv } from "../src/config/env";
import { openDatabase } from "../src/db/client";
import { createUsersRepository } from "../src/modules/users/users.repository";

const [username, password, name = username, roleName = "Patron"] = process.argv.slice(2);

if (!username || !password || password.length < 6) {
  console.error('Kullanım: bun run user:create <kullanıcı_adı> <şifre (en az 6)> [ad] [rol adı, ör. "Patron", "Temsilci"]');
  process.exit(1);
}

const db = openDatabase(readEnv().DATABASE_PATH);
const users = createUsersRepository(db);
const role = users.roleByName(roleName);
if (!role) {
  console.error(`"${roleName}" adlı rol yok. Mevcut roller: ${users.roles().map((r) => r.name).join(", ")}`);
  process.exit(1);
}
if (users.usernameTaken(username)) {
  console.error(`"${username}" kullanıcı adı zaten var.`);
  process.exit(1);
}
const id = users.create({ username, name: name!, passwordHash: await hashPassword(password), roleId: role.id, active: true, numbers: [] });
console.log(`Kullanıcı eklendi: #${id} ${username} (${role.name})`);
db.close();
