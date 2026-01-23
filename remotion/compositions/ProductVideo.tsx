import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { OpeningScene } from '../scenes/OpeningScene';
import { ProblemScene } from '../scenes/ProblemScene';
import { FeatureScene } from '../scenes/FeatureScene';
import { ClosingScene } from '../scenes/ClosingScene';

export interface ProductVideoProps {
  title: string;
  tagline: string;
}

export const ProductVideo: React.FC<ProductVideoProps> = ({ title, tagline }) => {
  const { fps } = useVideoConfig();

  // Scene durations (in frames at 30fps)
  const openingDuration = fps * 5; // 5 seconds
  const problemDuration = fps * 6; // 6 seconds
  const feature1Duration = fps * 10; // 10 seconds - AI Contract Generation
  const feature2Duration = fps * 10; // 10 seconds - Document Analysis
  const feature3Duration = fps * 10; // 10 seconds - Contract Review
  const feature4Duration = fps * 10; // 10 seconds - Client Management
  const closingDuration = fps * 9; // 9 seconds

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a' }}>
      {/* Opening Scene */}
      <Sequence from={0} durationInFrames={openingDuration}>
        <OpeningScene title={title} tagline={tagline} />
      </Sequence>

      {/* Problem Scene */}
      <Sequence from={openingDuration} durationInFrames={problemDuration}>
        <ProblemScene />
      </Sequence>

      {/* Feature 1: AI Contract Generation */}
      <Sequence
        from={openingDuration + problemDuration}
        durationInFrames={feature1Duration}
      >
        <FeatureScene
          icon="✨"
          title="AI Contract Generation"
          description="Draft professional contracts instantly with OpenAI"
          highlights={[
            'Generate contracts from simple prompts',
            'Powered by GPT-4 intelligence',
            'Customizable templates',
          ]}
          color="#3b82f6"
        />
      </Sequence>

      {/* Feature 2: Document Analysis & Comparison */}
      <Sequence
        from={openingDuration + problemDuration + feature1Duration}
        durationInFrames={feature2Duration}
      >
        <FeatureScene
          icon="🔍"
          title="AI Document Analysis"
          description="Compare and analyze contracts side-by-side"
          highlights={[
            'Automatic risk detection',
            'Clause-level comparison',
            'Similarity scoring & insights',
          ]}
          color="#8b5cf6"
        />
      </Sequence>

      {/* Feature 3: Smart Contract Review */}
      <Sequence
        from={openingDuration + problemDuration + feature1Duration + feature2Duration}
        durationInFrames={feature3Duration}
      >
        <FeatureScene
          icon="⚡"
          title="Smart Contract Review"
          description="Comprehensive AI-powered contract analysis"
          highlights={[
            'Extract key obligations',
            'Compliance checking',
            'Risk assessment & recommendations',
          ]}
          color="#ec4899"
        />
      </Sequence>

      {/* Feature 4: Client & Matter Management */}
      <Sequence
        from={
          openingDuration +
          problemDuration +
          feature1Duration +
          feature2Duration +
          feature3Duration
        }
        durationInFrames={feature4Duration}
      >
        <FeatureScene
          icon="📊"
          title="Complete Case Management"
          description="Organize clients, cases, and matters seamlessly"
          highlights={[
            'Centralized client database',
            'Real-time activity tracking',
            'Analytics & insights dashboard',
          ]}
          color="#10b981"
        />
      </Sequence>

      {/* Closing Scene */}
      <Sequence
        from={
          openingDuration +
          problemDuration +
          feature1Duration +
          feature2Duration +
          feature3Duration +
          feature4Duration
        }
        durationInFrames={closingDuration}
      >
        <ClosingScene />
      </Sequence>
    </AbsoluteFill>
  );
};
