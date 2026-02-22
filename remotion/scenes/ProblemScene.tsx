import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const problemsOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const solutionOpacity = interpolate(frame, [80, 100], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const solutionScale = interpolate(frame, [80, 100], [0.9, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        fontFamily,
      }}
    >
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
        }}
      >
        {/* Title */}
        <h2
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#ef4444',
            margin: 0,
            marginBottom: 60,
            opacity: titleOpacity,
            textAlign: 'center',
          }}
        >
          The Legal Industry Challenge
        </h2>

        {/* Problems */}
        <div
          style={{
            opacity: problemsOpacity,
            display: 'flex',
            flexDirection: 'column',
            gap: 30,
            maxWidth: 900,
          }}
        >
          {[
            '⏰ Hours spent on manual contract review',
            '📄 Documents scattered across systems',
            '❌ High risk of human error',
            '💸 Inefficient client management',
          ].map((problem, index) => (
            <div
              key={index}
              style={{
                fontSize: 36,
                color: '#cbd5e1',
                opacity: interpolate(frame, [30 + index * 10, 50 + index * 10], [0, 1], {
                  extrapolateRight: 'clamp',
                }),
                transform: `translateX(${interpolate(
                  frame,
                  [30 + index * 10, 50 + index * 10],
                  [-50, 0],
                  { extrapolateRight: 'clamp' }
                )}px)`,
              }}
            >
              {problem}
            </div>
          ))}
        </div>

        {/* Solution intro */}
        <div
          style={{
            marginTop: 80,
            opacity: solutionOpacity,
            transform: `scale(${solutionScale})`,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: '#10b981',
              textAlign: 'center',
            }}
          >
            ✨ There's a better way
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
