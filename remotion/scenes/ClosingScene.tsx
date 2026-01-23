import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ctaOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const ctaScale = spring({
    frame: frame - 10,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
    },
  });

  const titleOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const subtitleOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const buttonOpacity = interpolate(frame, [90, 120], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const buttonScale = spring({
    frame: frame - 90,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
    },
  });

  // Pulsing glow effect
  const glowIntensity = Math.abs(Math.sin(frame / 30)) * 0.5 + 0.5;

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        fontFamily,
      }}
    >
      {/* Animated gradient orbs */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          right: '15%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
          filter: `blur(60px)`,
          opacity: glowIntensity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          left: '10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
          filter: `blur(60px)`,
          opacity: glowIntensity,
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
        }}
      >
        {/* CTA Icon */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `scale(${Math.min(ctaScale, 1)})`,
            marginBottom: 50,
          }}
        >
          <div
            style={{
              width: 150,
              height: 150,
              borderRadius: 40,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 80,
              boxShadow: `0 30px 80px rgba(59, 130, 246, ${glowIntensity * 0.6})`,
            }}
          >
            🚀
          </div>
        </div>

        {/* Main CTA Title */}
        <h2
          style={{
            fontSize: 84,
            fontWeight: 900,
            background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            marginBottom: 30,
            opacity: titleOpacity,
            textAlign: 'center',
            letterSpacing: '-0.03em',
          }}
        >
          Transform Your Legal Practice
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 42,
            fontWeight: 500,
            color: '#cbd5e1',
            margin: 0,
            marginBottom: 60,
            opacity: subtitleOpacity,
            textAlign: 'center',
            maxWidth: 900,
          }}
        >
          Join leading law firms using AI to work smarter, not harder
        </p>

        {/* CTA Button */}
        <div
          style={{
            opacity: buttonOpacity,
            transform: `scale(${Math.min(buttonScale, 1)})`,
          }}
        >
          <div
            style={{
              padding: '28px 70px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              borderRadius: 20,
              fontSize: 40,
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: `0 20px 60px rgba(59, 130, 246, 0.5)`,
              border: '3px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            Get Started Today
          </div>
        </div>

        {/* Website URL */}
        <div
          style={{
            marginTop: 50,
            opacity: interpolate(frame, [120, 150], [0, 1], {
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <p
            style={{
              fontSize: 32,
              color: '#94a3b8',
              margin: 0,
            }}
          >
            www.kourtilegal.com
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
