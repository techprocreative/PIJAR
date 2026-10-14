// Hook efek samping realtime: langganan event room `admin` → refresh queries terkait.
// Dipakai layout agar semua halaman tetap tersinkron selama sesi admin aktif.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ServerEvent } from '@pijar/shared';
import { subscribeAdminEvents } from '../realtime/socket';

const EVENT_QUERY_PREFIXES: Record<string, string[]> = {
  'order:new': ['dashboard', 'verifications', 'orders'],
  'order:bid': ['dashboard', 'orders'],
  'order:matched': ['dashboard', 'orders'],
  'order:status': ['dashboard', 'orders'],
  'order:cancelled': ['dashboard', 'orders'],
  'tracking:location': [],
  'mitra:status': ['dashboard', 'verifications'],
  'wallet:updated': [],
};

export function useAdminRealtime(enabled = true): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    return subscribeAdminEvents((event: ServerEvent) => {
      const prefixes = EVENT_QUERY_PREFIXES[event.event];
      if (!prefixes) return;
      for (const prefix of prefixes) {
        queryClient.invalidateQueries({ queryKey: ['admin', prefix] });
      }
    }, () => {
      // Event yang terlewat saat offline tidak diputar ulang oleh Socket.IO.
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    });
  }, [enabled, queryClient]);
}
