import { useApp } from '../context/AppContext';
import { Construction } from 'lucide-react';

function Placeholder({ name }) {
  const { theme } = useApp();
  const dark = theme === 'dark';
  return (
    <div className={`flex flex-col items-center justify-center h-64 rounded-2xl border ${dark ? 'border-[#30363D] bg-[#161B22]' : 'border-gray-200 bg-white'}`}>
      <Construction size={28} className={dark ? 'text-[#484F58]' : 'text-gray-300'} />
      <div className={`mt-3 text-sm font-semibold ${dark ? 'text-[#8B949E]' : 'text-gray-400'}`}>{name}</div>
      <div className={`text-xs mt-1 ${dark ? 'text-[#484F58]' : 'text-gray-300'}`}>Coming soon</div>
    </div>
  );
}

export const Pipeline   = () => <Placeholder name="Pipeline View" />;
export const Settings   = () => <Placeholder name="Settings" />;
export const HotLeads   = () => <Placeholder name="Hot Leads Filter" />;
export const FollowUps  = () => <Placeholder name="Follow Ups" />;
export const DemoBooked = () => <Placeholder name="Demo Booked" />;
export const ReEngage   = () => <Placeholder name="Re-engage" />;

export const Memory = () => <Placeholder name="AI Memory" />;
