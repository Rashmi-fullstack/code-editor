'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4';
const POSTER_SRC =
  'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg';

export default function AnimatedBackground() {
  const pathname = usePathname();
  const isHome = pathname === '/';
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
      if (!isHome || document.visibilityState !== 'visible') return;
      video.muted = true;
      video.defaultMuted = true;
      const res = video.play();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          // Browser autoplay restrictions can still delay playback until interaction.
        });
      }
    };

    if (!isHome) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

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
      if (!isHome) return;
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
      if (!isHome) return;
      if (video.paused) playSafe();
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
    };

    window.addEventListener('click', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });

    return () => {
      video.removeEventListener('loadeddata', playSafe);
      video.removeEventListener('canplay', playSafe);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('pageshow', handleVisibility);
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
    };
  }, [isHome]);

  // Keep DOM mounted in background so decoded video buffer remains in memory across page navigations,
  // but strictly hide and pause when on other sections (Projects, Editor, Profile)
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-[#02060f] transition-opacity duration-300 ${
        isHome ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        display: isHome ? 'block' : 'none',
        backgroundImage: isHome ? `url(${POSTER_SRC})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: '50% 50%',
      }}
    >
      {/* High-Performance Looping Hero Video — 0% bandwidth duplication, seamless native hardware loop */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={POSTER_SRC}
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none opacity-90"
      />

      {/* Atmospheric Volumetric Veil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(140% 60% at 50% 40%, rgba(6, 10, 18, 0.15) 0%, rgba(6, 10, 18, 0.08) 50%, rgba(6, 10, 18, 0.02) 100%),
            linear-gradient(180deg, rgba(6, 10, 18, 0) 35%, rgba(2, 6, 15, 0.65) 75%, #02060f 100%)
          `,
        }}
      />
    </div>
  );
}