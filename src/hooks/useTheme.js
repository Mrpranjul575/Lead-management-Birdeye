import { useApp } from '../context/AppContext';

export function useTheme() {
  const { theme } = useApp();
  const dark = theme === 'dark';
  return {
    dark,
    T1:  dark ? '#E6EDF3' : '#111827',
    T2:  dark ? '#8B949E' : '#6B7280',
    T3:  dark ? '#484F58' : '#9CA3AF',
    B1:  dark ? '#30363D' : '#E5E7EB',
    B2:  dark ? '#484F58' : '#D1D5DB',
    S1:  dark ? '#161B22' : '#FFFFFF',
    S2:  dark ? '#0D1117' : '#F8F9FA',
    S3:  dark ? '#21262D' : '#F3F4F5',
    BG:  dark ? '#0D1117' : '#F8F9FA',
  };
}
