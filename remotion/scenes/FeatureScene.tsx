import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

export interface FeatureSceneProps {
  icon: string;
  title: string;
  description: string;
  highlights: string[];
  color: string;
}

export const FeatureScene: React.FC<FeatureSceneProps> = ({
  icon,
  title,
  description,
  highlights,
  color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Icon animation
  const iconScale = spring({
    frame: frame - 10,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
      mass: 0.5,
    },
  });

  const iconRotation = interpolate(frame, [0, 30], [0, 360], {
    extrapolateRight: 'clamp',
  });

  // Title animation
  const titleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [20, 40], [30, 0], {
    extrapolateRight: 'clamp',
  });

  // Description animation
  const descriptionOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
        fontFamily,
      }}
    >
      {/* Animated background accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: `radial-gradient(circle at 30% 50%, ${color}15 0%, transparent 60%)`,
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 100,
        }}
      >
        {/* Icon */}
        <div
          style={{
            transform: `scale(${iconScale}) rotate(${iconRotation}deg)`,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 35,
              background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
              boxShadow: `0 25px 70px ${color}40`,
            }}
          >
            {icon}
          </div>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#ffffff',
            margin: 0,
            marginBottom: 20,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: 36,
            fontWeight: 500,
            color: '#94a3b8',
            margin: 0,
            marginBottom: 60,
            opacity: descriptionOpacity,
            textAlign: 'center',
            maxWidth: 900,
          }}
        >
          {description}
        </p>

        {/* Highlights */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            maxWidth: 1000,
            width: '100%',
          }}
        >
          {highlights.map((highlight, index) => {
            const highlightOpacity = interpolate(
              frame,
              [60 + index * 20, 80 + index * 20],
              [0, 1],
              { extrapolateRight: 'clamp' }
            );

            const highlightX = interpolate(
              frame,
              [60 + index * 20, 80 + index * 20],
              [-100, 0],
              { extrapolateRight: 'clamp' }
            );

            const highlightScale = spring({
              frame: frame - (60 + index * 20),
              fps,
              config: {
                damping: 100,
                stiffness: 200,
              },
            });

            return (
              <div
                key={index}
                style={{
                  opacity: highlightOpacity,
                  transform: `translateX(${highlightX}px) scale(${Math.min(highlightScale, 1)})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '24px 32px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 16,
                  border: `2px solid ${color}40`,
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: `0 0 20px ${color}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 32,
                    color: '#e2e8f0',
                    fontWeight: 500,
                  }}
                >
                  {highlight}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
