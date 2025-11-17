'use client';

export function DecorativePaws() {
  return (
    <div className="fixed inset-0 pointer-events-none opacity-[0.015] overflow-hidden z-0">
      <div className="absolute top-10 right-20 text-6xl rotate-12">🐾</div>
      <div className="absolute top-32 left-24 text-5xl -rotate-45">🐾</div>
      <div className="absolute bottom-40 right-32 text-7xl rotate-[-25deg]">🐾</div>
      <div className="absolute bottom-20 left-16 text-6xl rotate-[60deg]">🐾</div>
      <div className="absolute top-1/2 left-1/3 text-5xl rotate-[15deg]">🐾</div>
      <div className="absolute top-1/3 right-1/4 text-6xl rotate-[-30deg]">🐾</div>
    </div>
  );
}
