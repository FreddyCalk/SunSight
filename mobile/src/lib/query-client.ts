import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      retry: false,
    },
  },
});

let focusListenerAttached = false;

/** Wire TanStack Query focus recovery to React Native AppState. */
export function attachQueryFocusManager(): void {
  if (focusListenerAttached) {
    return;
  }

  focusListenerAttached = true;
  focusManager.setEventListener((handleFocus) => {
    const onChange = (status: AppStateStatus) => {
      handleFocus(status === 'active');
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  });
}
