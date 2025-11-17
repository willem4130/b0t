'use client';

import { useEffect, useState } from 'react';
import CountUp from 'react-countup';

interface AnimatedCounterProps {
  value: number;
  className?: string;
  duration?: number;
  onEnd?: (value: number) => void;
}

/**
 * Animated counter component using react-countup
 *
 * Smoothly animates number changes with proper formatting
 */
export function AnimatedCounter({
  value,
  className = '',
  duration = 1.5,
  onEnd,
}: AnimatedCounterProps) {
  const [previousValue, setPreviousValue] = useState(value);

  useEffect(() => {
    setPreviousValue(value);
  }, [value]);

  return (
    <CountUp
      start={previousValue}
      end={value}
      duration={duration}
      separator=","
      decimals={0}
      className={className}
      onEnd={() => onEnd?.(value)}
      preserveValue
    />
  );
}
