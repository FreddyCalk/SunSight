import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

import {
  notificationDataToSkyWindowPath,
  parseSkyWindowUrl,
  type SkyWindowPath,
} from './deep-links';
import {
  clearPendingDeepLink,
  loadPendingDeepLink,
  savePendingDeepLink,
} from './pending-deep-link';

export function NotificationDeepLinkObserver() {
  const router = useRouter();
  const pathname = usePathname();
  const { gate } = useAuth();
  const handledNotificationIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    const consumePath = async (path: SkyWindowPath): Promise<boolean> => {
      if (gate.status !== 'ready') {
        await savePendingDeepLink(path).catch(() => undefined);
        return false;
      }
      if (pathname !== path) {
        router.push(path);
      }
      await clearPendingDeepLink().catch(() => undefined);
      return true;
    };

    const openResponse = async (response: Notifications.NotificationResponse) => {
      const notificationId = response.notification.request.identifier;
      if (handledNotificationIds.current.has(notificationId)) {
        return;
      }

      const path = notificationDataToSkyWindowPath(
        response.notification.request.content.data,
      );
      if (!path) {
        return;
      }

      if (await consumePath(path)) {
        handledNotificationIds.current.add(notificationId);
        await Notifications.clearLastNotificationResponseAsync();
      }
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void openResponse(response);
      });
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      const path = parseSkyWindowUrl(url);
      if (path) {
        void consumePath(path);
      }
    });

    void (async () => {
      if (gate.status === 'ready') {
        const pendingPath = await loadPendingDeepLink();
        if (active && pendingPath) {
          await consumePath(pendingPath);
          if (active) {
            await Notifications.clearLastNotificationResponseAsync();
          }
          return;
        }
      }

      const [response, initialUrl] = await Promise.all([
        Notifications.getLastNotificationResponseAsync(),
        Linking.getInitialURL(),
      ]);
      if (!active) {
        return;
      }
      if (response) {
        await openResponse(response);
        return;
      }
      const initialPath = parseSkyWindowUrl(initialUrl);
      if (initialPath) {
        await consumePath(initialPath);
      }
    })();

    return () => {
      active = false;
      subscription.remove();
      linkingSubscription.remove();
    };
  }, [gate.status, pathname, router]);

  return null;
}
