import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedTransitionProps {
  children: ReactNode;
  className?: string;
  animation?: "fade" | "slide" | "scale" | "slide-up";
  delay?: number;
}

export function AnimatedTransition({
  children,
  className,
  animation = "fade",
  delay = 0,
}: AnimatedTransitionProps) {
  const animationClasses = {
    fade: "animate-fade-in",
    slide: "animate-slide-in",
    scale: "animate-scale-in",
    "slide-up": "animate-slide-up",
  };

  return (
    <div
      className={cn(animationClasses[animation], className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Stagger children animation
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 100,
}: StaggerContainerProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <AnimatedTransition
              key={index}
              animation="slide-up"
              delay={index * staggerDelay}
            >
              {child}
            </AnimatedTransition>
          ))
        : children}
    </div>
  );
}

