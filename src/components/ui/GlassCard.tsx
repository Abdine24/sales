import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = false,
  ...props
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hoverEffect ? { y: -4, scale: 1.01 } : undefined}
      whileTap={hoverEffect ? { scale: 0.99 } : undefined}
      className={`glass-card rounded-2xl p-5 border transition-all duration-300 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};
