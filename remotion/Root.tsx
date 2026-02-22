import { Composition } from 'remotion';
import { ProductVideo } from './compositions/ProductVideo';

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
          title: 'Kourti Legal',
          tagline: 'AI-Powered Legal Operations',
        }}
      />
    </>
  );
};
