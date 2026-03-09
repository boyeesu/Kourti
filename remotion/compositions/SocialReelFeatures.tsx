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

const AnimatedBackground: React.FC<{ frame: number; totalFrames: number }> = ({
  frame,
  totalFrames,
}) => {
  const bgProgress = interpolate(frame, [0, totalFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const bg1Opacity = 1 - bgProgress * 0.3;
  const bg2Opacity = bgProgress * 0.3;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: COLORS.darkBg,
          opacity: bg1Opacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: COLORS.darkSurface,
          opacity: bg2Opacity,
        }}
      />
      {/* Floating glow */}
      <div
        style={{
          position: 'absolute',
          top: `${40 + Math.sin(frame / 60) * 10}%`,
          left: `${50 + Math.cos(frame / 45) * 15}%`,
          transform: 'translate(-50%, -50%)',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(121, 165, 234, 0.08) 0%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
      />
    </>
  );
};

const OpeningScene: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.8 },
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleOpacity = interpolate(frame, [25, 50], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [25, 50], [50, 0], {
    extrapolateRight: 'clamp',
  });

  // Fade out at end
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
        padding: 60,
        opacity: fadeOut,
      }}
    >
      {/* Logo icon */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${Math.min(logoScale, 1)})`,
          marginBottom: 50,
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 35,
            background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 72,
            boxShadow: `0 25px 70px rgba(121, 165, 234, 0.4)`,
          }}
        >
          <span style={{ filter: 'grayscale(1) brightness(10)' }}>&#9878;</span>
        </div>
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: playfairFont,
          fontSize: 72,
          fontWeight: 800,
          color: '#ffffff',
          margin: 0,
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.2,
        }}
      >
        Meet Your AI{'\n'}Legal Assistant
      </h1>
    </AbsoluteFill>
  );
};

const FeatureScene: React.FC<{
  frame: number;
  fps: number;
  icon: string;
  title: string;
  bullets: string[];
}> = ({ frame, fps, icon, title, bullets }) => {
  // Fade in
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Fade out
  const fadeOut = interpolate(frame, [155, 180], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const iconScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  const titleOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [15, 35], [30, 0], {
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
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      {/* Icon */}
      <div
        style={{
          fontSize: 100,
          marginBottom: 40,
          transform: `scale(${Math.min(iconScale, 1)})`,
        }}
      >
        {icon}
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily: playfairFont,
          fontSize: 64,
          fontWeight: 700,
          background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: 0,
          marginBottom: 50,
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </h2>

      {/* Bullets */}
      <div style={{ width: '100%', maxWidth: 800 }}>
        {bullets.map((bullet, i) => {
          const bulletDelay = 40 + i * 25;
          const bulletOpacity = interpolate(frame, [bulletDelay, bulletDelay + 20], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const bulletX = interpolate(frame, [bulletDelay, bulletDelay + 20], [60, 0], {
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 30,
                opacity: bulletOpacity,
                transform: `translateX(${bulletX}px)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.primary} 100%)`,
                  marginRight: 24,
                  flexShrink: 0,
                }}
              />
              <p
                style={{
                  fontFamily: interFont,
                  fontSize: 40,
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.85)',
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {bullet}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ClosingCTA: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const headlineOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const headlineY = interpolate(frame, [0, 25], [40, 0], {
    extrapolateRight: 'clamp',
  });

  const brandOpacity = interpolate(frame, [40, 65], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const brandScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, stiffness: 80, mass: 1 },
  });

  const urlOpacity = interpolate(frame, [80, 105], [0, 1], {
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
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(121, 165, 234, 0.15) 0%, transparent 70%)`,
          filter: 'blur(80px)',
          opacity: glowPulse,
        }}
      />

      {/* Headline */}
      <h2
        style={{
          fontFamily: playfairFont,
          fontSize: 64,
          fontWeight: 800,
          color: '#ffffff',
          margin: 0,
          marginBottom: 60,
          textAlign: 'center',
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          lineHeight: 1.3,
        }}
      >
        Transform Your{'\n'}Legal Practice
      </h2>

      {/* Brand */}
      <div
        style={{
          opacity: brandOpacity,
          transform: `scale(${Math.min(brandScale, 1)})`,
          marginBottom: 40,
        }}
      >
        <h3
          style={{
            fontFamily: interFont,
            fontSize: 48,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.35em',
            margin: 0,
            textAlign: 'center',
          }}
        >
          K O U R T I
        </h3>
        <h4
          style={{
            fontFamily: interFont,
            fontSize: 30,
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: '0.5em',
            margin: 0,
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          L E G A L
        </h4>
      </div>

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

export const SocialReelFeatures: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: interFont }}>
      <AnimatedBackground frame={frame} totalFrames={900} />

      {/* Scene 1: Opening */}
      <Sequence from={0} durationInFrames={120}>
        <OpeningScene frame={useCurrentFrame()} fps={fps} />
      </Sequence>

      {/* Scene 2: Smart Contract Review */}
      <Sequence from={120} durationInFrames={180}>
        <FeatureScene
          frame={useCurrentFrame()}
          fps={fps}
          icon="&#128196;"
          title="Smart Contract Review"
          bullets={[
            'AI-powered clause analysis',
            'Automatic risk detection',
            'Compliance verification',
          ]}
        />
      </Sequence>

      {/* Scene 3: Document Assembly */}
      <Sequence from={300} durationInFrames={180}>
        <FeatureScene
          frame={useCurrentFrame()}
          fps={fps}
          icon="&#9997;"
          title="Document Assembly"
          bullets={[
            'Generate contracts in minutes',
            'Customizable templates',
            'Multi-format export',
          ]}
        />
      </Sequence>

      {/* Scene 4: Risk Monitoring */}
      <Sequence from={480} durationInFrames={180}>
        <FeatureScene
          frame={useCurrentFrame()}
          fps={fps}
          icon="&#128737;"
          title="Risk Monitoring"
          bullets={[
            'Real-time obligation tracking',
            'Deadline & renewal alerts',
            'Regulatory compliance checks',
          ]}
        />
      </Sequence>

      {/* Scene 5: CTA */}
      <Sequence from={660} durationInFrames={240}>
        <ClosingCTA frame={useCurrentFrame()} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};
