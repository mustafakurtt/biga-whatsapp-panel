// Kök: sorgu istemcisi, yönlendirici, oturum kapısı ve rotalar.
//   /                       gelen kutusu (son numara)
//   /n/:numberId            numaranın sohbetleri
//   /n/:numberId/c/:chatId  açık sohbet
//   /yonetim/:section       yönetim
//   /?chat=<id>             bildirimden derin bağlantı → ilgili sohbet
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ApiError, onUnauthorized, UnauthorizedError } from "./api/client";
import { fetchMe, qk } from "./api/queries";
import type { Me } from "./api/types";
import { OverlayHost } from "./components/overlays";
import { AdminPage } from "./features/admin/AdminPage";
import { SessionProvider, useAdminSections } from "./features/app/session";
import { InboxPage } from "./features/inbox/InboxPage";
import { LoginPage } from "./features/login/LoginPage";
import { AppShell } from "./features/shell/AppShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx tekrar denenmez (yetki/bulunamadı); ağ ve 5xx en fazla 2 kez
      retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate />
        <OverlayHost />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const qc = useQueryClient();
  const [expired, setExpired] = useState<string | null>(null);
  const me = useQuery({
    queryKey: qk.me,
    staleTime: Infinity,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await fetchMe();
      } catch (err) {
        if (err instanceof UnauthorizedError) return null;
        throw err;
      }
    },
  });

  useEffect(() => {
    onUnauthorized(() => {
      // Oturum düştü (süre doldu ya da hesap kapatıldı): açık oturum varsa uyarıyla girişe dön.
      if (qc.getQueryData(qk.me)) {
        setExpired("Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" });
        qc.setQueryData(qk.me, null);
      }
    });
  }, [qc]);

  if (me.isPending) {
    return (
      <div className="boot" aria-busy="true">
        <div className="boot-mark" />
      </div>
    );
  }
  if (!me.data) {
    return (
      <LoginPage
        message={expired ?? (me.error ? me.error.message : null)}
        onLoggedIn={(m) => {
          setExpired(null);
          qc.setQueryData(qk.me, m);
        }}
      />
    );
  }
  return (
    <SessionProvider me={me.data}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<InboxPage />} />
          <Route path="n/:numberId" element={<InboxPage />} />
          <Route path="n/:numberId/c/:chatId" element={<InboxPage />} />
          <Route path="yonetim" element={<AdminIndex />} />
          <Route path="yonetim/:section" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}

function AdminIndex() {
  const first = useAdminSections()[0];
  return <Navigate to={first ? `/yonetim/${first.id}` : "/"} replace />;
}
