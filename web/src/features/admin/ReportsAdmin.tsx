// Yönetim › Raporlar: GET /api/reports/summary?days=7|30
// Göstergeler tek bölünmüş kutuda, günlük gelen/giden sütun grafiği, numara ve kişi kırılımı (ilk cevap süresiyle).
import { useState } from "react";
import { errorMessage } from "../../api/client";
import { useReport } from "../../api/queries";
import type { Summary } from "../../api/types";
import { Avatar, BlockError, PageHead, Segmented, cx } from "../../components/ui";
import { fmtDuration, nf } from "../../lib/format";
import { DailyChart, fmtDay } from "./DailyChart";

let lastDays = 7;

export function ReportsAdmin() {
  const [days, setDays] = useState(lastDays);
  const q = useReport(days);
  const sum = q.data;
  const daily = sum?.daily ?? [];
  const first = daily[0];
  const last = daily[daily.length - 1];
  const range = first && last ? `${fmtDay(first.day, { day: "numeric", month: "long" })} – ${fmtDay(last.day, { day: "numeric", month: "long" })}` : "";

  return (
    <>
      <PageHead
        title="Raporlar"
        sub={sum ? `Son ${sum.days} gün${range ? ` · ${range}` : ""} · görebildiğiniz numaralar` : "Yükleniyor…"}
        actions={
          <Segmented
            label="Dönem"
            value={days}
            onChange={(d) => {
              lastDays = d;
              setDays(d);
            }}
            options={[{ value: 7, label: "7 gün" }, { value: 30, label: "30 gün" }]}
          />
        }
      />
      {q.isError ? (
        <div className="panel"><BlockError message={`Rapor yüklenemedi: ${errorMessage(q.error)}`} onRetry={() => void q.refetch()} /></div>
      ) : !sum ? (
        <p className="muted">Yükleniyor…</p>
      ) : (
        <div className={cx("reports", q.isFetching && q.isPlaceholderData && "is-loading")}>
          <Report sum={sum} />
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, className, muted }: { label: string; value: string; sub: string; className?: string; muted?: boolean }) {
  return (
    <div className={cx("kpi", className)}>
      <p className="kpi-label">{label}</p>
      <p className={cx("kpi-value num", muted && "muted")}>{value}</p>
      <p className="kpi-sub">{sub || " "}</p>
    </div>
  );
}

function Report({ sum }: { sum: Summary }) {
  const t = sum.totals;
  const share = (part: number) => (t.outgoing ? `giden içinde %${Math.round((part / t.outgoing) * 100)}` : "—");
  const panelShare = t.outgoing ? Math.round((t.panel / t.outgoing) * 100) : null;
  const finding = t.incoming === 0 && t.outgoing === 0
    ? "Bu dönemde mesaj yok."
    : `${nf.format(t.incoming)} gelen, ${nf.format(t.outgoing)} giden mesaj${panelShare !== null ? ` · gidenlerde panel payı %${panelShare}` : ""}`;
  const r = sum.response;
  const hasResp = Boolean(r && r.samples > 0);

  const perNumber = [...sum.perNumber].sort((a, b) => b.incoming + b.outgoing - (a.incoming + a.outgoing));
  const maxN = Math.max(1, ...perNumber.map((n) => Math.max(n.incoming, n.outgoing)));
  const perUser = [...sum.perUser].sort((a, b) => b.sent - a.sent);
  const maxU = Math.max(1, ...perUser.map((u) => u.sent));

  return (
    <>
      <section className="panel kpis" aria-label="Özet">
        <Kpi label="Gelen" value={nf.format(t.incoming)} sub="müşteriden" />
        <Kpi label="Giden" value={nf.format(t.outgoing)} sub="toplam yanıt" />
        <Kpi label="Panelden" value={nf.format(t.panel)} sub={share(t.panel)} />
        <Kpi label="Telefondan" value={nf.format(t.phone)} sub={share(t.phone)} />
        <Kpi label="Sohbet" value={nf.format(t.chats)} sub="mesajlaşılan kişi" />
        <Kpi
          className="kpi-response"
          label="Ort. ilk cevap süresi"
          value={hasResp ? fmtDuration(r.averageMs) : "—"}
          muted={!hasResp}
          sub={hasResp ? `medyan ${fmtDuration(r.medianMs)} · ${nf.format(r.samples)} cevap` : "bu dönemde cevap yok"}
        />
      </section>

      <section className="panel chart-panel">
        <div className="panel-head row">
          <div>
            <h2 className="h2">Günlük mesaj</h2>
            <p className="panel-sub">{finding}</p>
          </div>
          <div className="legend">
            <span className="legend-item"><span className="swatch swatch-in" />Gelen</span>
            <span className="legend-item"><span className="swatch swatch-out" />Giden</span>
          </div>
        </div>
        <DailyChart daily={sum.daily} />
        <details className="chart-table">
          <summary>Günlük tabloyu göster</summary>
          <table className="table table-compact">
            <thead>
              <tr><th>Gün</th><th className="num">Gelen</th><th className="num">Giden</th></tr>
            </thead>
            <tbody>
              {sum.daily.map((d) => (
                <tr key={d.day}>
                  <td>{fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="num">{nf.format(d.incoming)}</td>
                  <td className="num">{nf.format(d.outgoing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h2">Numaraya göre</h2>
            <p className="panel-sub">{perNumber.length} numara</p>
          </div>
          {perNumber.length ? (
            <table className="table table-bars">
              <thead>
                <tr><th>Numara</th><th className="num">Gelen</th><th className="num">Giden</th></tr>
              </thead>
              <tbody>
                {perNumber.map((n) => (
                  <tr key={n.numberId}>
                    <td>
                      <span className="bar-label">{n.label}</span>
                      <span className="minibars" aria-hidden="true">
                        <span className="minibar minibar-in" style={{ width: `${(n.incoming / maxN) * 100}%` }} />
                        <span className="minibar minibar-out" style={{ width: `${(n.outgoing / maxN) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">{nf.format(n.incoming)}</td>
                    <td className="num">{nf.format(n.outgoing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pad muted">Görebildiğiniz numara yok.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h2">Kişiye göre</h2>
            <p className="panel-sub">Panelden gönderilen mesaj ve ilk cevap süresi</p>
          </div>
          {perUser.length ? (
            <table className="table table-bars table-users">
              <thead>
                <tr>
                  <th>Kişi</th>
                  <th className="num">Gönderilen</th>
                  <th className="num">İlk cevap</th>
                  <th className="num">Ort. süre</th>
                </tr>
              </thead>
              <tbody>
                {perUser.map((u, i) => (
                  <tr key={u.userId}>
                    <td>
                      <span className="user-cell"><Avatar name={u.name} id={u.userId} size="sm" /><span className="bar-label">{u.name}</span></span>
                      <span className="barlist-track" aria-hidden="true">
                        <span className={cx("barlist-fill", i === 0 && "lead")} style={{ width: `${(u.sent / maxU) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">{nf.format(u.sent)}</td>
                    <td className="num">{nf.format(u.replies ?? 0)}</td>
                    <td className={cx("num", u.avgResponseMs == null && "muted")}>{fmtDuration(u.avgResponseMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pad muted">Bu dönemde panelden mesaj gönderilmedi.</p>
          )}
        </section>
      </div>
    </>
  );
}
