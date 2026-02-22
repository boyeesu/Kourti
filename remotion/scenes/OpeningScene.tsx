import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

export interface OpeningSceneProps {
  title: string;
  tagline: string;
}

export const OpeningScene: React.FC<OpeningSceneProps> = ({ title, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation timings
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const logoScale = interpolate(frame, [0, 20], [0.8, 1], {
    extrapolateRight: 'clamp',
  });

  const titleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [20, 40], [30, 0], {
    extrapolateRight: 'clamp',
  });

  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const gradientRotation = interpolate(frame, [0, fps * 5], [0, 360], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientRotation}deg, #0f172a 0%, #1e293b 50%, #334155 100%)`,
        fontFamily,
      }}
    >
      {/* Animated background circles */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
          opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          left: '5%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
          opacity: interpolate(frame, [10, 40], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
        }}
      >
        {/* Logo/Icon placeholder */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              boxShadow: '0 20px 60px rgba(59, 130, 246, 0.4)',
            }}
          >
            ⚖️
          </div>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: '#ffffff',
            margin: 0,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontSize: 42,
            fontWeight: 500,
            color: '#94a3b8',
            margin: 0,
            marginTop: 20,
            opacity: taglineOpacity,
            textAlign: 'center',
          }}
        >
          {tagline}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
