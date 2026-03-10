import { Composition } from 'remotion';
import { ProductVideo } from './compositions/ProductVideo';
import { SocialReelStats } from './compositions/SocialReelStats';
import { SocialReelFeatures } from './compositions/SocialReelFeatures';
import { SocialSquarePromo } from './compositions/SocialSquarePromo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductVideo"
        component={ProductVideo}
        durationInFrames={1800} // 60 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Kourti AI',
          tagline: 'AI-Powered Legal Operations',
        }}
      />
      <Composition
        id="SocialReelStats"
        component={SocialReelStats}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{}}
      />
      <Composition
        id="SocialReelFeatures"
        component={SocialReelFeatures}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{}}
      />
      <Composition
        id="SocialSquarePromo"
        component={SocialSquarePromo}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
