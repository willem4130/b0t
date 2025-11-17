'use client';

import { Header } from './Header';
import { Navbar } from './Navbar';
import { DecorativePaws } from '@/components/ui/decorative-paws';
import { useKonamiCode } from '@/hooks/use-konami-code';
import { catSounds } from '@/lib/cat-sounds';
import { toast } from 'sonner';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // Easter egg: Konami code triggers cat sounds!
  useKonamiCode(() => {
    catSounds.playMeow();
    setTimeout(() => catSounds.playPurr(), 200);
    setTimeout(() => catSounds.playChirp(), 400);

    toast.success('🎉 Secret Cat Party Activated! 🐱', {
      description: 'You found the Konami code! The cats are celebrating! 🎊😸',
      duration: 5000,
    });

    // Trigger cat excitement
    window.dispatchEvent(new CustomEvent('cat:success'));
  });

  return (
    <div className="min-h-screen bg-background relative">
      <DecorativePaws />
      <Header />
      <Navbar />
      <main className="w-full relative z-10">
        {children}
      </main>
    </div>
  );
}
