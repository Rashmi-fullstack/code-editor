'use client';

import { useEffect, useRef } from 'react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4';

/**
 * AnimatedBackground renders exclusively on the Home page (app/page.tsx).
 * It unmounts automatically when the user navigates away, ensuring zero leakage
 * into application routes (Projects, Editor, Profile, etc.).
 */
export default function AnimatedBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');

    const playSafe = () => {
      if (document.visibilityState !== 'visible') return;
      video.muted = true;
      video.defaultMuted = true;
      const res = video.play();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          // Autoplay handled safely
        });
      }
    };

    if (!video.src || !video.src.includes('cloudfront.net')) {
      video.src = VIDEO_SRC;
    }

    if (video.readyState >= 2) {
      playSafe();
    } else {
      video.addEventListener('loadeddata', playSafe, { once: true });
      video.addEventListener('canplay', playSafe, { once: true });
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (video.paused) playSafe();
      } else {
        video.pause();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('pageshow', handleVisibility);

    const onUserInteraction = () => {
      if (video.paused) playSafe();
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
    };

    window.addEventListener('click', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });

    return () => {
      video.pause();
      video.removeEventListener('loadeddata', playSafe);
      video.removeEventListener('canplay', playSafe);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('pageshow', handleVisibility);
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-[#000000]"
    >
      {/* High-Performance Looping Full-Bleed Background Video */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
      />

      {/* Subtle atmospheric tint so text remains readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
        }}
      />
    </div>
  );
}