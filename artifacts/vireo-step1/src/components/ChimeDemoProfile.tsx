import { useEffect, useState, type CSSProperties } from 'react';
import { tokens } from '@workspace/vireo-design-system/tokens';
import { ChimeAskPanel } from './ChimeAskPanel';
import './ChimeDemoProfile.css';

const palette = tokens.color.dark;
const MIN_BLINK_INTERVAL_MS = 2400;
const BLINK_INTERVAL_VARIANCE_MS = 3000;
const BLINK_DURATION_MS = 180;
const profileStyle = {
  color: palette.foreground,
  '--chime-muted': palette.mutedForeground,
} as CSSProperties;

export function ChimeDemoProfile() {
  const [isBlinking, setIsBlinking] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let blinkTimer = 0;
    let blinkResetTimer = 0;
    let mounted = true;

    const isEditing = () => {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLElement
        && activeElement.matches('input, textarea, select, [contenteditable="true"]');
    };

    const clearBlinkTimers = () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(blinkResetTimer);
    };

    const syncMonitoringMotion = () => {
      setIsMonitoring(mounted && !motionPreference.matches && !document.hidden && !isEditing());
    };

    const scheduleBlink = () => {
      if (!mounted || motionPreference.matches || document.hidden) return;
      blinkTimer = window.setTimeout(() => {
        setIsBlinking(true);
        blinkResetTimer = window.setTimeout(() => {
          if (!mounted) return;
          setIsBlinking(false);
          scheduleBlink();
        }, BLINK_DURATION_MS);
      }, MIN_BLINK_INTERVAL_MS + Math.random() * BLINK_INTERVAL_VARIANCE_MS);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement
        && target.matches('input, textarea, select, [contenteditable="true"]')) setIsMonitoring(false);
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        syncMonitoringMotion();
      }, 0);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        setIsMonitoring(false);
        clearBlinkTimers();
        setIsBlinking(false);
      } else {
        syncMonitoringMotion();
        scheduleBlink();
      }
    };

    const onMotionPreferenceChange = () => {
      clearBlinkTimers();
      setIsBlinking(false);
      setIsMonitoring(false);
      if (!motionPreference.matches) {
        syncMonitoringMotion();
        scheduleBlink();
      }
    };

    syncMonitoringMotion();
    scheduleBlink();
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      clearBlinkTimers();
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <section
      className="chime-demo-profile"
      aria-labelledby="chime-demo-profile-title"
      style={profileStyle}
    >
      <div className="chime-demo-profile__identity">
        <span className={`chime-demo-profile__orb${isMonitoring ? ' chime-demo-profile__orb--monitoring' : ''}`} role="img" aria-label="Chime, Vireo’s Voice Orb assistant">
          <img src="/chime-voice-orb.png" alt="" aria-hidden="true" />
          <span className={`chime-demo-profile__eyes${isBlinking ? ' chime-demo-profile__eyes--blink' : ''}`} aria-hidden="true"><i /><i /></span>
        </span>
        <div className="chime-demo-profile__copy">
          <p className="chime-demo-profile__eyebrow">VIREO’S WORKSPACE AGENT</p>
          <h2 id="chime-demo-profile-title">Chime is Monitoring</h2>
          <ChimeAskPanel />
        </div>
      </div>
    </section>
  );
}
