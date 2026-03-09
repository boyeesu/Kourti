import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';

const { fontFamily: interFont } = loadInter();
const { fontFamily: playfairFont } = loadPlayfair();

const COLORS = {
  primary: '#79A5EA',
  accent: '#AFC8F0',
  darkBg: '#09090B',
  darkSurface: '#111318',
};

// --- Grid Background ---

const GridBackground: React.FC<{ frame: number }> = ({ frame }) => {
  const gridOpacity = interpolate(frame, [0, 30], [0, 0.06], {
    extrapolateRight: 'clamp',
  });

  const gridOffset = (frame * 0.3) % 60;

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: COLORS.darkBg }} />
      {/* Grid pattern via repeating lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(rgba(121, 165, 234, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(121, 165, 234, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          backgroundPosition: `${gridOffset}px ${gridOffset}px`,
        }}
      />
      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(121, 165, 234, 0.08) 0%, transparent 70%)`,
          filter: 'blur(80px)',
        }}
      />
    </>
  );
};

// --- Scene 1: Headline ---

const HeadlineScene: React.FC<{ frame: number; fps: number }> = ({ frame }) => {
  const lineOpacity1 = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const lineY1 = interpolate(frame, [0, 25], [40, 0], {
    extrapolateRight: 'clamp',
  });

  const lineOpacity2 = interpolate(frame, [15, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const lineY2 = interpolate(frame, [15, 40], [40, 0], {
    extrapolateRight: 'clamp',
  });

  const accentOpacity = interpolate(frame, [40, 65], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Fade out
  const fadeOut = interpolate(frame, [100, 120], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        opacity: fadeOut,
      }}
    >
      <h1
        style={{
          fontFamily: playfairFont,
          fontSize: 80,
          fontWeight: 800,
          color: '#ffffff',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.2,
          opacity: lineOpacity1,
          transform: `translateY(${lineY1}px)`,
        }}
      >
        The Future of
      </h1>
      <h1
        style={{
          fontFamily: playfairFont,
          fontSize: 80,
          fontWeight: 800,
          background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.2,
          opacity: lineOpacity2,
          transform: `translateY(${lineY2}px)`,
        }}
      >
        Legal Operations
      </h1>

      {/* Accent line */}
      <div
        style={{
          width: 120,
          height: 4,
          background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
          borderRadius: 2,
          marginTop: 30,
          opacity: accentOpacity,
        }}
      />
    </AbsoluteFill>
  );
};

// --- Scene 2: Stats ---

const StatsScene: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const stats = [
    { value: '73%', label: 'Faster' },
    { value: '60%', label: 'Cost Savings' },
    { value: '99.2%', label: 'Accuracy' },
  ];

  // Fade in / out
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 50,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stats.map((stat, i) => {
          const delay = i * 20;

          const statScale = spring({
            frame: frame - delay,
            fps,
            config: { damping: 12, stiffness: 100, mass: 0.8 },
          });

          const statOpacity = interpolate(frame, [delay, delay + 20], [0, 1], {
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: statOpacity,
                transform: `scale(${Math.min(statScale, 1)})`,
              }}
            >
              <h2
                style={{
                  fontFamily: playfairFont,
                  fontSize: 72,
                  fontWeight: 900,
                  background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                {stat.value}
              </h2>
              <p
                style={{
                  fontFamily: interFont,
                  fontSize: 28,
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.7)',
                  margin: 0,
                  marginTop: 10,
                  textAlign: 'center',
                }}
              >
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// --- Scene 3: Powered by AI ---

const PoweredByScene: React.FC<{ frame: number }> = ({ frame }) => {
  const textOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const textY = interpolate(frame, [0, 25], [30, 0], {
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [130, 150], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        opacity: fadeOut,
      }}
    >
      <h2
        style={{
          fontFamily: playfairFont,
          fontSize: 68,
          fontWeight: 800,
          color: '#ffffff',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.3,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        Powered by AI.
      </h2>
      <h2
        style={{
          fontFamily: playfairFont,
          fontSize: 68,
          fontWeight: 800,
          background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: 0,
          marginTop: 10,
          textAlign: 'center',
          lineHeight: 1.3,
          opacity: interpolate(frame, [15, 40], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `translateY(${interpolate(frame, [15, 40], [30, 0], { extrapolateRight: 'clamp' })}px)`,
        }}
      >
        Built for Legal Teams.
      </h2>
    </AbsoluteFill>
  );
};

// --- Scene 4: Brand CTA ---

const BrandCTA: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const brandScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80, mass: 1 },
  });

  const brandOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const taglineOpacity = interpolate(frame, [30, 55], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const buttonScale = spring({
    frame: frame - 60,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.8 },
  });

  const buttonOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const glowPulse = Math.sin(frame / 15) * 0.3 + 0.7;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(121, 165, 234, 0.15) 0%, transparent 70%)`,
          filter: 'blur(80px)',
          opacity: glowPulse,
        }}
      />

      {/* Brand mark */}
      <div
        style={{
          opacity: brandOpacity,
          transform: `scale(${Math.min(brandScale, 1)})`,
          marginBottom: 30,
        }}
      >
        <h2
          style={{
            fontFamily: interFont,
            fontSize: 52,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.35em',
            margin: 0,
            textAlign: 'center',
          }}
        >
          K O U R T I
        </h2>
        <h3
          style={{
            fontFamily: interFont,
            fontSize: 32,
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: '0.5em',
            margin: 0,
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          L E G A L
        </h3>
      </div>

      {/* Tagline */}
      <p
        style={{
          fontFamily: playfairFont,
          fontSize: 36,
          fontWeight: 600,
          fontStyle: 'italic',
          color: 'rgba(255, 255, 255, 0.7)',
          margin: 0,
          marginBottom: 40,
          opacity: taglineOpacity,
          textAlign: 'center',
        }}
      >
        AI-Powered Legal Operations
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
            padding: '22px 60px',
            background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
            borderRadius: 16,
            fontSize: 32,
            fontWeight: 700,
            fontFamily: interFont,
            color: COLORS.darkBg,
            boxShadow: `0 20px 60px rgba(121, 165, 234, 0.4)`,
            border: '2px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          Get Started Today
        </div>
      </div>

      {/* URL */}
      <p
        style={{
          fontFamily: interFont,
          fontSize: 26,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.4)',
          margin: 0,
          marginTop: 30,
          opacity: interpolate(frame, [90, 110], [0, 1], { extrapolateRight: 'clamp' }),
          textAlign: 'center',
        }}
      >
        kourti.legal
      </p>
    </AbsoluteFill>
  );
};

// --- Main Composition ---

export const SocialSquarePromo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: interFont }}>
      <GridBackground frame={frame} />

      {/* Scene 1: Headline */}
      <Sequence from={0} durationInFrames={120}>
        <HeadlineScene frame={useCurrentFrame()} fps={fps} />
      </Sequence>

      {/* Scene 2: Stats */}
      <Sequence from={120} durationInFrames={180}>
        <StatsScene frame={useCurrentFrame()} fps={fps} />
      </Sequence>

      {/* Scene 3: Powered by AI */}
      <Sequence from={300} durationInFrames={150}>
        <PoweredByScene frame={useCurrentFrame()} />
      </Sequence>

      {/* Scene 4: Brand CTA */}
      <Sequence from={450} durationInFrames={150}>
        <BrandCTA frame={useCurrentFrame()} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};
