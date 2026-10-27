// Yönetim › Kullanıcılar: tablo, aktiflik anahtarı, oluştur/düzenle çekmecesi, numara erişim matrisi.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { del, errorMessage, post, put } from "../../api/client";
import { qk, useImpersonateTargets, useNumbers, useRoles, useUsers } from "../../api/queries";
import type { ManagedUser, NumberAccess, NumberView, Role } from "../../api/types";
import { Icon } from "../../components/Icon";
import { confirmDialog, Dialog, showError, toast } from "../../components/overlays";
import { Avatar, BlockError, Button, Field, PageHead, Pill, Segmented, Switch, cx } from "../../components/ui";
import { fmtAgo, fmtFull, fmtPhone } from "../../lib/format";
import { useStartImpersonation } from "../app/impersonation";
import { useSession } from "../app/session";

type Access = NumberAccess | "none";
const ACCESS_OPTS: { value: Access; label: string }[] = [
  { value: "none", label: "Erişim yok" },
  { value: "read", label: "Okuma" },
  { value: "write", label: "Yazma" },
];

export function UsersAdmin() {
  const { user: me, has } = useSession();
  const qc = useQueryClient();
  const usersQ = useUsers();
  const rolesQ = useRoles();
  const numbers = useNumbers().data ?? [];
  const targetsQ = useImpersonateTargets(has("impersonate.view"));
  const startImpersonation = useStartImpersonation();
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);

  const users = usersQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const targets = useMemo(() => new Set((targetsQ.data ?? []).map((t) => t.id)), [targetsQ.data]);
  const roleOf = (u: ManagedUser) => roles.find((r) => r.id === u.roleId);

  const accessSummary = (u: ManagedUser): { text: string; sub?: string; none?: boolean } => {
    if (roleOf(u)?.permissions.includes("numbers.view_all")) return { text: "Tüm numaralar", sub: "rol gereği" };
    const parts = (u.numbers ?? [])
      .map((a) => {
        const n = numbers.find((x) => x.id === a.numberId);
        return n ? `${n.label} (${a.access === "write" ? "yazma" : "okuma"})` : null;
      })
      .filter(Boolean);
    if (!parts.length) return { text: "Erişim yok", none: true };
    return { text: parts.join(", ") };
  };

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: qk.users }), qc.invalidateQueries({ queryKey: qk.roles }), qc.invalidateQueries({ queryKey: qk.impTargets })]);
  };

  const toggleActive = async (u: ManagedUser, checked: boolean) => {
    qc.setQueryData<ManagedUser[]>(qk.users, (list) => list?.map((x) => (x.id === u.id ? { ...x, active: checked } : x)));
    try {
      const { user } = await put<{ user: ManagedUser }>(`/api/users/${u.id}`, { active: checked });
      if (user) qc.setQueryData<ManagedUser[]>(qk.users, (list) => list?.map((x) => (x.id === u.id ? user : x)));
      toast(checked ? `${u.name} etkinleştirildi` : `${u.name} devre dışı bırakıldı; açık oturumu kapandı`, "ok");
      void qc.invalidateQueries({ queryKey: qk.impTargets });
    } catch (err) {
      qc.setQueryData<ManagedUser[]>(qk.users, (list) => list?.map((x) => (x.id === u.id ? { ...x, active: !checked } : x)));
      showError(err);
    }
  };

  const loading = usersQ.isLoading || rolesQ.isLoading;
  const active = users.filter((u) => u.active).length;
  return (
    <>
      <PageHead
        title="Kullanıcılar"
        sub={loading ? "Yükleniyor…" : `${users.length} kullanıcı · ${active} aktif`}
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Kullanıcı ekle</Button>}
      />
      <div className="panel panel-flush">
        {usersQ.isError || rolesQ.isError ? (
          <BlockError message={`Kullanıcılar yüklenemedi: ${errorMessage(usersQ.error ?? rolesQ.error)}`} onRetry={() => void refresh()} />
        ) : loading ? (
          <p className="pad muted">Yükleniyor…</p>
        ) : !users.length ? (
          <p className="pad muted">Henüz kullanıcı yok.</p>
        ) : (
          <table className="table users-table">
            <thead>
              <tr>
                <th scope="col">Kişi</th>
                <th scope="col">Rol</th>
                <th scope="col">Numara erişimi</th>
                <th scope="col" className="num">Son giriş</th>
                <th scope="col" className="th-center">Aktif</th>
                <th scope="col" className="th-actions"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id;
                const acc = accessSummary(u);
                const onRow = (e: MouseEvent) => {
                  if (!(e.target as HTMLElement).closest("button, input, label")) setEditing(u);
                };
                return (
                  <tr key={u.id} className={cx(!u.active && "is-inactive")} onClick={onRow}>
                    <td className="cell-ident">
                      <Avatar name={u.name} id={u.id} />
                      <span className="ident-text">
                        <span className="ident-name">{u.name}{self && <span className="muted"> (siz)</span>}</span>
                        <span className="ident-sub">@{u.username}</span>
                      </span>
                    </td>
                    <td data-label="Rol"><Pill>{u.roleName}</Pill></td>
                    <td className={cx("cell-access", acc.none && "muted")} data-label="Erişim" title={acc.text}>
                      {acc.text}{acc.sub && <span className="muted"> · {acc.sub}</span>}
                    </td>
                    <td className="num muted" data-label="Son giriş" title={u.lastLoginAt ? fmtFull(u.lastLoginAt) : "Hiç giriş yapmadı"}>
                      {u.lastLoginAt ? fmtAgo(u.lastLoginAt) : "—"}
                    </td>
                    <td className="td-center" data-label="Aktif">
                      <Switch checked={u.active} disabled={self} label={`${u.name} aktif`} onChange={(c) => void toggleActive(u, c)} />
                    </td>
                    <td className="td-actions">
                      {targets.has(u.id) && (
                        <Button size="sm" variant="ghost" icon="eye" title={`${u.name} kullanıcısının ekranına geç`} onClick={() => void startImpersonation(u.id)}>
                          Ekranına geç
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Düzenle</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <UserDrawer
          user={editing === "new" ? null : editing}
          roles={roles}
          numbers={numbers}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

function UserDrawer({ user, roles, numbers, onClose, onSaved }: { user: ManagedUser | null; roles: Role[]; numbers: NumberView[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const session = useSession();
  const qc = useQueryClient();
  const isNew = !user;
  const self = user?.id === session.user.id;
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number>(user?.roleId ?? roles.find((r) => r.name === "Temsilci")?.id ?? roles[0]?.id ?? 0);
  const [active, setActive] = useState(user?.active ?? true);
  const [access, setAccess] = useState<Map<number, NumberAccess>>(() => new Map((user?.numbers ?? []).map((a) => [a.numberId, a.access])));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const role = roles.find((r) => r.id === roleId);
  const notes: string[] = [];
  if (role?.permissions.includes("numbers.view_all")) notes.push("Bu rol atama olmadan tüm numaraları görür.");
  if (role && !role.permissions.includes("messages.send")) notes.push("Bu rolde mesaj gönderme izni yok; Yazma erişimi Okuma gibi çalışır.");

  const setNumberAccess = (id: number, v: Access) =>
    setAccess((m) => {
      const next = new Map(m);
      if (v === "none") next.delete(id);
      else next.set(id, v);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim() || (isNew && !username.trim())) {
      setErr("Ad ve kullanıcı adı gerekli.");
      return;
    }
    if (isNew && password.length < 6) {
      setErr("Şifre en az 6 karakter olmalı.");
      return;
    }
    const body: Record<string, unknown> = {
      name: name.trim(),
      roleId,
      active,
      numbers: [...access.entries()].map(([numberId, a]) => ({ numberId, access: a })),
    };
    if (password) body.password = password;
    if (isNew) body.username = username.trim();
    setBusy(true);
    try {
      if (isNew) await post("/api/users", body);
      else await put(`/api/users/${user.id}`, body);
    } catch (ex) {
      setErr(errorMessage(ex));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    toast(isNew ? "Kullanıcı eklendi" : "Kullanıcı güncellendi", "ok");
    if (self) void qc.invalidateQueries({ queryKey: qk.me });
    await onSaved();
  };

  const remove = async () => {
    if (!user) return;
    const ok = await confirmDialog({ title: `${user.name} silinsin mi?`, message: `@${user.username} hesabı kalıcı olarak silinir. Gönderdiği mesajlar ve etkinlik kaydı kalır.`, confirmText: "Kullanıcıyı sil", danger: true });
    if (!ok) return;
    try {
      await del(`/api/users/${user.id}`);
      onClose();
      toast("Kullanıcı silindi", "ok");
      await onSaved();
    } catch (ex) {
      showError(ex);
    }
  };

  return (
    <Dialog
      title={isNew ? "Yeni kullanıcı" : user.name}
      kind="drawer"
      onClose={onClose}
      footer={
        <>
          {!isNew && !self && (
            <Button variant="danger-ghost" icon="trash" className="foot-left" onClick={() => void remove()}>Sil</Button>
          )}
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="user-form" variant="primary" disabled={busy}>{isNew ? "Kullanıcıyı ekle" : "Kaydet"}</Button>
        </>
      }
    >
      <form id="user-form" className="form-stack" onSubmit={(e) => void submit(e)}>
        <Field label="Ad soyad">
          {(id) => <input ref={nameRef} id={id} className="input" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Kullanıcı adı" hint={isNew ? "Girişte kullanılır, sonradan değiştirilemez." : "Kullanıcı adı değiştirilemez."}>
          {(id) => <input id={id} className="input" required autoComplete="off" autoCapitalize="none" disabled={!isNew} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
        <Field label={isNew ? "Şifre" : "Yeni şifre"} hint={isNew ? undefined : "Boş bırakırsanız değişmez."}>
          {(id) => <input id={id} className="input" type="password" autoComplete="new-password" required={isNew} placeholder={isNew ? "En az 6 karakter" : "Değiştirmek için yazın"} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Rol">
          {(id) => (
            <select id={id} className="input select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </Field>
        {notes.length > 0 && <p className="field-hint">{notes.join(" ")}</p>}
        <div className="switch-row">
          <div>
            <p className="switch-title">Hesap aktif</p>
            <p className="field-hint">{self ? "Kendi hesabınızı devre dışı bırakamazsınız." : "Kapatılırsa kişi giriş yapamaz, açık oturumu hemen düşer."}</p>
          </div>
          <Switch checked={active} disabled={self} label="Hesap aktif" onChange={setActive} />
        </div>
        <section className="form-section">
          <h3 className="h3">Numara erişimi</h3>
          <p className="field-hint">Okuma: sohbetleri görür. Yazma: görür ve yanıtlar.</p>
          <div className="access-matrix" role="group" aria-label="Numara erişimi">
            {!numbers.length && <p className="muted pad">Henüz numara yok.</p>}
            {numbers.map((n) => (
              <div key={n.id} className="access-row">
                <div className="access-num">
                  <span className="access-label">{n.label}</span>
                  <span className="muted num">{fmtPhone(n.phone)}</span>
                </div>
                <Segmented size="sm" label={`${n.label} erişimi`} options={ACCESS_OPTS} value={access.get(n.id) ?? "none"} onChange={(v) => setNumberAccess(n.id, v)} />
              </div>
            ))}
          </div>
        </section>
        {err && <p className="form-error" role="alert"><Icon name="x" size={12} /> {err}</p>}
      </form>
    </Dialog>
  );
}
