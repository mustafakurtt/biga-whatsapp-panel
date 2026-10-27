// Yönetim › Roller: rol listesi (kullanıcı sayısıyla), izin kutuları gruplu düzenleme.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { del, errorMessage, post, put } from "../../api/client";
import { qk, usePermissionCatalog, useRoles } from "../../api/queries";
import type { Permission, PermissionInfo, Role } from "../../api/types";
import { Icon } from "../../components/Icon";
import { confirmDialog, Dialog, showError, toast } from "../../components/overlays";
import { BlockError, Button, Field, PageHead } from "../../components/ui";

export function RolesAdmin() {
  const qc = useQueryClient();
  const rolesQ = useRoles();
  const permsQ = usePermissionCatalog();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const roles = rolesQ.data ?? [];
  const perms = permsQ.data ?? [];
  const labelOf = (key: string) => perms.find((p) => p.key === key)?.label ?? key;

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: qk.roles }), qc.invalidateQueries({ queryKey: qk.users })]);
  };

  const loading = rolesQ.isLoading || permsQ.isLoading;
  return (
    <>
      <PageHead
        title="Roller"
        sub={loading ? "Yükleniyor…" : `${roles.length} rol · bir rol, bir izin listesidir`}
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Rol ekle</Button>}
      />
      {rolesQ.isError || permsQ.isError ? (
        <div className="panel"><BlockError message={`Roller yüklenemedi: ${errorMessage(rolesQ.error ?? permsQ.error)}`} onRetry={() => void Promise.all([rolesQ.refetch(), permsQ.refetch()])} /></div>
      ) : (
        <div className="role-list">
          {roles.map((r) => {
            const all = perms.length > 0 && r.permissions.length === perms.length;
            const summary = r.permissions.length === 0
              ? "İzin yok: yalnızca atandığı numaraları okur"
              : all ? "Tüm izinler" : r.permissions.map(labelOf).join(" · ");
            return (
              <button key={r.id} type="button" className="panel role-card" onClick={() => setEditing(r)}>
                <div className="role-top">
                  <h2 className="h3">{r.name}</h2>
                  {r.system && <span className="pill pill-neutral"><Icon name="lock" size={12} /><span>Sistem rolü</span></span>}
                  <span className="role-count num">{r.userCount} kullanıcı</span>
                </div>
                <p className="role-perms">{summary}</p>
                <span className="role-meta muted">{r.permissions.length} / {perms.length} izin</span>
              </button>
            );
          })}
        </div>
      )}
      {editing && <RoleDrawer role={editing === "new" ? null : editing} perms={perms} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function RoleDrawer({ role, perms, onClose, onSaved }: { role: Role | null; perms: PermissionInfo[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const isNew = !role;
  const ro = Boolean(role?.system);
  const [name, setName] = useState(role?.name ?? "");
  const [chosen, setChosen] = useState<Set<Permission>>(() => new Set(role?.permissions ?? []));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!ro) nameRef.current?.focus();
  }, [ro]);

  const groups = useMemo(() => {
    const g = new Map<string, PermissionInfo[]>();
    for (const p of perms) {
      const list = g.get(p.group) ?? [];
      list.push(p);
      g.set(p.group, list);
    }
    return [...g.entries()];
  }, [perms]);

  const toggle = (key: Permission, on: boolean) =>
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (ro) return;
    setErr("");
    if (!name.trim()) {
      setErr("Rol adı gerekli.");
      return;
    }
    const payload = { name: name.trim(), permissions: [...chosen] };
    setBusy(true);
    try {
      if (isNew) await post("/api/roles", payload);
      else await put(`/api/roles/${role.id}`, payload);
    } catch (ex) {
      setErr(errorMessage(ex));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    toast(isNew ? "Rol eklendi" : "Rol güncellendi", "ok");
    await onSaved();
  };

  const remove = async () => {
    if (!role) return;
    const ok = await confirmDialog({ title: `"${role.name}" rolü silinsin mi?`, message: "Bu işlem geri alınamaz.", confirmText: "Rolü sil", danger: true });
    if (!ok) return;
    try {
      await del(`/api/roles/${role.id}`);
      onClose();
      toast("Rol silindi", "ok");
      await onSaved();
    } catch (ex) {
      showError(ex);
    }
  };

  const blocked = Boolean(role && role.userCount > 0);
  return (
    <Dialog
      title={isNew ? "Yeni rol" : role.name}
      kind="drawer"
      onClose={onClose}
      footer={
        <>
          {!isNew && !ro && (
            <Button
              variant="danger-ghost"
              icon="trash"
              className="foot-left"
              disabled={blocked}
              title={blocked ? `Bu rolde ${role.userCount} kullanıcı var; önce onları başka role taşıyın.` : "Rolü sil"}
              onClick={() => void remove()}
            >
              {blocked ? `Silinemez (${role.userCount} kullanıcı)` : "Sil"}
            </Button>
          )}
          <Button onClick={onClose}>{ro ? "Kapat" : "Vazgeç"}</Button>
          {!ro && <Button type="submit" form="role-form" variant="primary" disabled={busy}>{isNew ? "Rolü ekle" : "Kaydet"}</Button>}
        </>
      }
    >
      <form id="role-form" className="form-stack" onSubmit={(e) => void submit(e)}>
        {ro && (
          <div className="notice">
            <Icon name="lock" size={16} />
            <span>Patron sistem rolüdür: tüm izinlere sahiptir, değiştirilemez ve silinemez.</span>
          </div>
        )}
        <Field label="Rol adı">
          {(id) => <input ref={nameRef} id={id} className="input" required disabled={ro} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <section className="form-section">
          <h3 className="h3">İzinler</h3>
          {groups.map(([group, list]) => (
            <fieldset key={group} className="perm-group">
              <legend className="perm-legend">{group}</legend>
              {list.map((p) => (
                <label key={p.key} className="perm-item">
                  <input type="checkbox" className="check" checked={chosen.has(p.key)} disabled={ro} onChange={(e) => toggle(p.key, e.target.checked)} />
                  <span className="perm-text">
                    <span>{p.label}</span>
                    <span className="perm-key">{p.key}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </section>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </Dialog>
  );
}
