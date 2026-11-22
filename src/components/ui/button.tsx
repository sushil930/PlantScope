import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#166534] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#166534] text-white hover:bg-[#14532D]',
        secondary: 'bg-[#F1F5F3] text-[#111C17] border border-[#DCE4DF] hover:bg-[#E5ECE8]',
        outline: 'border border-[#DCE4DF] bg-white text-[#111C17] hover:bg-[#F1F5F3]',
        ghost: 'text-[#4B5D54] hover:bg-[#F1F5F3] hover:text-[#111C17]',
        destructive: 'bg-[#BE123C] text-white hover:bg-[#9F1239]',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-3.5 text-xs',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-10 w-10',
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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
