import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme';

/** Switches between dark and light; the choice is remembered on this device. */
export function ThemeSwitch({ label = false, className = 'ui-btn is-sm' }: { label?: boolean; className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={className} onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
      {label && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
    </button>
  );
}
