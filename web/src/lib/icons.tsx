import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });

export const SearchIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>);
export const SlidersIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>);
export const ChevronDown = ({ size = 14, ...p }: P) => (<svg {...base(size)} strokeWidth={2.2} {...p}><path d="M6 9l6 6 6-6" /></svg>);
export const ChevronRight = ({ size = 20, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M9 6l6 6-6 6" /></svg>);
export const ChevronLeft = ({ size = 22, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M15 6l-6 6 6 6" /></svg>);
export const LockIcon = ({ size = 18, ...p }: P) => (<svg {...base(size)} strokeWidth={1.9} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const CheckIcon = ({ size = 22, ...p }: P) => (<svg {...base(size)} strokeWidth={2.4} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const CloseIcon = ({ size = 22, ...p }: P) => (<svg {...base(size)} strokeWidth={1.9} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const MenuIcon = ({ size = 24, ...p }: P) => (<svg {...base(size)} strokeWidth={1.7} {...p}><path d="M4 8h16M4 16h16" /></svg>);
export const BellIcon = ({ size = 22, ...p }: P) => (<svg {...base(size)} strokeWidth={1.7} {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>);
export const WhatsAppIcon = ({ size = 18, ...p }: P) => (<svg {...base(size)} stroke="#f7f5ef" {...p}><path d="M4 20l1.3-4.2A8 8 0 1 1 8.2 18.8L4 20z" /></svg>);
export const StarIcon = ({ size = 28, filled = false, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.6} {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></svg>
);
export const PinIcon = ({ size = 16, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></svg>);
export const ShieldIcon = ({ size = 14, ...p }: P) => (<svg {...base(size)} strokeWidth={2} {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
