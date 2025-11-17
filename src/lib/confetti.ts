/**
 * Confetti celebration effects using canvas-confetti
 *
 * Lightweight wrapper for success celebrations across the app
 */

import confetti from 'canvas-confetti';

/**
 * Fire basic confetti celebration
 */
export function fireConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
  });
}

/**
 * Fire success confetti (cat-themed! 🐱)
 * Shoots from the cat mascot in the bottom-right corner
 */
export function fireSuccessConfetti() {
  window.dispatchEvent(new CustomEvent('cat:success'));

  const catFaces = ['🐱', '😺', '😸', '😻', '🐾'];

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { x: 0.85, y: 0.85 },
    colors: ['#ff6b35', '#ff8c5a', '#ffad7f'],
    shapes: ['circle'],
    scalar: 1.2,
  });

  // Add cat emoji confetti
  confetti({
    particleCount: 15,
    spread: 60,
    origin: { x: 0.85, y: 0.85 },
    scalar: 2,
    shapes: catFaces.map(() => confetti.shapeFromText({ text: catFaces[Math.floor(Math.random() * catFaces.length)], scalar: 2 })),
  });
}

/**
 * Fire platform-specific colored confetti (with cats!)
 * Shoots from the cat mascot in the bottom-right corner
 */
export function firePlatformConfetti(platform: 'twitter' | 'youtube' | 'instagram') {
  const colorMap = {
    twitter: ['#1DA1F2', '#56bff3', '#8cd4f7'],
    youtube: ['#FF0000', '#ff4d4d', '#ff8080'],
    instagram: ['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888'],
  };

  const catFaces = ['🐱', '😺', '😸', '😻', '🐾'];

  confetti({
    particleCount: 100,
    spread: 70,
    origin: { x: 0.85, y: 0.85 },
    colors: colorMap[platform],
  });

  // Add cat emoji confetti
  confetti({
    particleCount: 12,
    spread: 60,
    origin: { x: 0.85, y: 0.85 },
    scalar: 2,
    shapes: catFaces.map(() => confetti.shapeFromText({ text: catFaces[Math.floor(Math.random() * catFaces.length)], scalar: 2 })),
  });
}

/**
 * Fire milestone confetti (big celebration with CATS! 🎉🐱)
 * Epic celebration from the cat mascot in the bottom-right
 */
export function fireMilestoneConfetti() {
  window.dispatchEvent(new CustomEvent('cat:success'));

  const duration = 2000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 35, spread: 90, ticks: 80, zIndex: 0 };
  const catFaces = ['🐱', '😺', '😸', '😻', '🐾', '😼', '😽'];

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval: ReturnType<typeof setInterval> = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    // Main burst from cat (bottom-right)
    confetti({
      ...defaults,
      particleCount: particleCount * 1.5,
      origin: { x: 0.85, y: 0.85 }
    });

    // Secondary burst with slight variation
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.75, 0.95), y: randomInRange(0.75, 0.95) }
    });

    // Cat emoji confetti from the cat
    confetti({
      ...defaults,
      particleCount: 10,
      scalar: 2.5,
      spread: 100,
      shapes: catFaces.map(() => confetti.shapeFromText({ text: catFaces[Math.floor(Math.random() * catFaces.length)], scalar: 2 })),
      origin: { x: 0.85, y: 0.85 }
    });
  }, 250);
}

/**
 * Check if a number is a milestone (100, 500, 1000, etc.)
 */
export function isMilestone(num: number): boolean {
  const milestones = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  return milestones.includes(num);
}
