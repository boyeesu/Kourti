import { useEffect, useState } from 'react';

const MouseFollowGlow = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.body.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.body.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isVisible]);

  return (
    <>
      {/* Primary glow - follows mouse */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: isVisible ? 1 : 0,
        }}
      >
        <div
          className="absolute w-[600px] h-[600px] rounded-full transition-all duration-200 ease-out"
          style={{
            background: 'radial-gradient(circle, hsl(215 70% 76% / 0.08) 0%, transparent 70%)',
            left: mousePosition.x - 300,
            top: mousePosition.y - 300,
          }}
        />
      </div>

      {/* Secondary smaller glow - tighter follow */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: isVisible ? 1 : 0,
        }}
      >
        <div
          className="absolute w-[300px] h-[300px] rounded-full transition-all duration-100 ease-out"
          style={{
            background: 'radial-gradient(circle, hsl(215 65% 70% / 0.12) 0%, transparent 70%)',
            left: mousePosition.x - 150,
            top: mousePosition.y - 150,
          }}
        />
      </div>

      {/* Floating ambient orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl animate-float" />
        <div
          className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-primary/3 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s', animationDuration: '4s' }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-[350px] h-[350px] bg-primary/4 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '2s', animationDuration: '5s' }}
        />
      </div>
    </>
  );
};

export default MouseFollowGlow;
