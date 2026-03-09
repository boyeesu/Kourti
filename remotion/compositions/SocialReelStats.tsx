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

// --- Scene Components ---

const AnimatedGlow: React.FC<{ frame: number }> = ({ frame }) => {
  const pulse = Math.sin(frame / 20) * 0.15 + 0.85;
  const drift = Math.sin(frame / 40) * 30;

  return (
    <div
      style={{
        position: 'absolute',
        top: `calc(50% + ${drift}px)`,
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(121, 165, 234, 0.15) 0%, transparent 70%)`,
        filter: 'blur(80px)',
        opacity: pulse,
      }}
    />
  );
};

const StatScene: React.FC<{
  frame: number;
  fps: number;
  statFrom?: string;
  statTo: string;
  description: string;
  useCounter?: boolean;
}> = ({ frame, fps, statFrom, statTo, description, useCounter }) => {
  const statScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  const statOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const descOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const descY = interpolate(frame, [15, 35], [40, 0], {
    extrapolateRight: 'clamp',
  });

  // Counter animation for "40 -> 4"
  let displayStat = statTo;
  if (useCounter && statFrom) {
    const from = parseInt(statFrom, 10);
    const to = parseInt(statTo, 10);
    const progress = interpolate(frame, [5, 60], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const current = Math.round(from + (to - from) * progress);
    displayStat = String(current);
  }

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}
    >
      <div
        style={{
          opacity: statOpacity,
          transform: `scale(${Math.min(statScale, 1.05)})`,
        }}
      >
        <h1
          style={{
            fontFamily: playfairFont,
            fontSize: 180,
            fontWeight: 900,
            background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          {displayStat}
        </h1>
      </div>

      <p
        style={{
          fontFamily: interFont,
          fontSize: 48,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.8)',
          margin: 0,
          marginTop: 30,
          opacity: descOpacity,
          transform: `translateY(${descY}px)`,
          textAlign: 'center',
          maxWidth: 800,
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
    </AbsoluteFill>
  );
};

const CTAScene: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
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

  const taglineY = interpolate(frame, [30, 55], [30, 0], {
    extrapolateRight: 'clamp',
  });

  const urlOpacity = interpolate(frame, [60, 85], [0, 1], {
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
        padding: 60,
      }}
    >
      {/* Glow behind brand */}
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(121, 165, 234, 0.2) 0%, transparent 70%)`,
          filter: 'blur(60px)',
          opacity: glowPulse,
        }}
      />

      {/* Brand mark */}
      <div
        style={{
          opacity: brandOpacity,
          transform: `scale(${Math.min(brandScale, 1)})`,
          marginBottom: 50,
        }}
      >
        <h2
          style={{
            fontFamily: interFont,
            fontSize: 56,
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
            fontSize: 36,
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: '0.5em',
            margin: 0,
            marginTop: 8,
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
          fontSize: 44,
          fontWeight: 600,
          fontStyle: 'italic',
          background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: 0,
          marginBottom: 40,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          textAlign: 'center',
        }}
      >
        Unlock the power of AI
      </p>

      {/* URL */}
      <p
        style={{
          fontFamily: interFont,
          fontSize: 32,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.5)',
          margin: 0,
          opacity: urlOpacity,
          textAlign: 'center',
        }}
      >
        kourti.legal
      </p>
    </AbsoluteFill>
  );
};

// --- Main Composition ---

export const SocialReelStats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.darkBg, fontFamily: interFont }}>
      <AnimatedGlow frame={frame} />

      {/* Scene 1: "40 -> 4" counter */}
      <Sequence from={0} durationInFrames={90}>
        <StatScene
          frame={useCurrentFrame()}
          fps={fps}
          statFrom="40"
          statTo="4"
          description="Hours to review a 100-page contract"
          useCounter
        />
      </Sequence>

      {/* Scene 2: 73% */}
      <Sequence from={90} durationInFrames={90}>
        <StatScene
          frame={useCurrentFrame()}
          fps={fps}
          statTo="73%"
          description="Faster contract reviews with AI"
        />
      </Sequence>

      {/* Scene 3: 120+ */}
      <Sequence from={180} durationInFrames={90}>
        <StatScene
          frame={useCurrentFrame()}
          fps={fps}
          statTo="120+"
          description="Hours saved per quarter"
        />
      </Sequence>

      {/* Scene 4: CTA */}
      <Sequence from={270} durationInFrames={180}>
        <CTAScene frame={useCurrentFrame()} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};
