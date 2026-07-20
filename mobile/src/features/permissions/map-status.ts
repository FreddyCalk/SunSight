export type AppPermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked';

/** Minimal permission snapshot shared by Expo permission APIs. */
export type PermissionSnapshot = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
};

/**
 * Map Expo permission responses into UI states.
 * `blocked` means the OS will not show another prompt (`canAskAgain === false`).
 */
export function mapPermissionResponse(response: PermissionSnapshot): AppPermissionState {
  if (response.granted || response.status === 'granted') {
    return 'granted';
  }

  if (response.status === 'undetermined') {
    return 'undetermined';
  }

  if (!response.canAskAgain) {
    return 'blocked';
  }

  return 'denied';
}

export function mapPermissionStatus(
  status: string,
  canAskAgain: boolean,
): AppPermissionState {
  return mapPermissionResponse({
    status,
    granted: status === 'granted',
    canAskAgain,
  });
}
