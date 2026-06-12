/**
 * React 18 hook for subscribing to window size changes.
 *
 * useSyncExternalStore keeps React synchronized with an external source
 * (window.innerWidth) and triggers a re-render only when the calculated
 * device type changes.
 *
 * SSR-safe: returns Desktop on the server and updates after hydration.
 */
import { useSyncExternalStore } from 'react';

export enum DeviceType {
  Mobile = 'mobile',
  Tablet = 'tablet',
  Desktop = 'desktop',
}

const MOBILE_BREAKPOINT = 420;
const TABLET_BREAKPOINT = 768;

const getDeviceType = (): DeviceType => {
  if (typeof window === 'undefined') {
    return DeviceType.Desktop;
  }

  const width = window.innerWidth;

  if (width < MOBILE_BREAKPOINT) {
    return DeviceType.Mobile;
  }

  if (width < TABLET_BREAKPOINT) {
    return DeviceType.Tablet;
  }

  return DeviceType.Desktop;
};

const subscribe = (callback: () => void) => {
  window.addEventListener('resize', callback);

  return () => {
    window.removeEventListener('resize', callback);
  };
};

export const useDeviceType = () => {
  const deviceType = useSyncExternalStore(
    subscribe,
    getDeviceType,
    () => DeviceType.Desktop,
  );

  return {
    deviceType,
    isMobile: deviceType === DeviceType.Mobile,
    isTablet: deviceType === DeviceType.Tablet,
    isDesktop: deviceType === DeviceType.Desktop,
  };
};