// Yönetim alanı: kenar çubuğunda kendi gezinmesi olan tam sayfa görünüm (gezinmeyi kabuk çizer).
import { useEffect, useRef, type ComponentType } from "react";
import { useParams } from "react-router";
import { useAdminSections } from "../app/session";
import { AuditAdmin } from "./AuditAdmin";
import { NumbersAdmin } from "./NumbersAdmin";
import { QuickRepliesAdmin } from "./QuickRepliesAdmin";
import { ReportsAdmin } from "./ReportsAdmin";
import { RolesAdmin } from "./RolesAdmin";
import { TagsAdmin } from "./TagsAdmin";
import { UsersAdmin } from "./UsersAdmin";

const SECTIONS: Record<string, ComponentType> = {
  numaralar: NumbersAdmin,
  kullanicilar: UsersAdmin,
  roller: RolesAdmin,
  "hazir-yanitlar": QuickRepliesAdmin,
  etiketler: TagsAdmin,
  etkinlik: AuditAdmin,
  raporlar: ReportsAdmin,
};

export function AdminPage() {
  const { section = "" } = useParams<{ section: string }>();
  const allowed = useAdminSections();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [section]);
  const Section = allowed.some((s) => s.id === section) ? SECTIONS[section] : undefined;
  return (
    <div className="admin" ref={ref}>
      <div className="admin-page">{Section ? <Section key={section} /> : null}</div>
    </div>
  );
}
