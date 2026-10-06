import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        // Signature Codatron White Pill (Home Page Canonical CTA)
        default:
          'bg-white text-black font-semibold hover:bg-slate-200 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.01] active:scale-[0.98]',
        // Signature Codatron Dark Pill (Home Page Nav/Action Pill)
        dark:
          'bg-[#28282a] text-[#c8c8c8] hover:text-white hover:bg-[#323234] border border-white/10 shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:-translate-y-0.5 active:translate-y-0',
        // Translucent Glass Pill
        glass:
          'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/15 backdrop-blur-md shadow-sm active:scale-[0.98]',
        // Primary / Accent Indigo Pill
        primary:
          'bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-[0_4px_16px_rgba(99,102,241,0.35)] hover:shadow-[0_6px_22px_rgba(99,102,241,0.5)] hover:scale-[1.01] active:scale-[0.98]',
        // Subtle Outline Pill
        outline:
          'border border-white/20 bg-transparent text-white hover:bg-white/10 hover:border-white/35 active:scale-[0.98]',
        // Secondary Muted Pill
        secondary:
          'bg-white/10 text-white hover:bg-white/15 border border-white/10 active:scale-[0.98]',
        // Ghost Pill
        ghost:
          'text-slate-300 hover:text-white hover:bg-white/[0.08]',
        // Destructive Pill
        destructive:
          'bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25 hover:text-white active:scale-[0.98]',
        // Link
        link: 'text-white underline-offset-4 hover:underline rounded-none p-0 h-auto',
      },
      size: {
        default: 'h-10 px-5 py-2 text-sm',
        sm: 'h-8 px-3.5 text-xs',
        lg: 'h-12 px-8 text-base font-semibold',
        icon: 'h-9 w-9 p-0 rounded-full',
        'icon-sm': 'h-7 w-7 p-0 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
