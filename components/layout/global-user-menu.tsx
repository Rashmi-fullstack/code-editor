'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  LogOut,
  Key,
  Sparkles,
  ChevronDown,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useCredits } from '@/components/credit-provider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface GlobalUserMenuProps {
  showTriggerLabel?: boolean;
  align?: 'start' | 'end' | 'center';
  className?: string;
}

export function GlobalUserMenu({
  showTriggerLabel = false,
  align = 'end',
  className = '',
}: GlobalUserMenuProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { creditsRemaining, creditLimit } = useCredits();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      router.push('/login');
    } catch {
      toast.error('Failed to log out');
    }
  };

  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`group flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer ${className}`}
          title={user?.email || 'User Account'}
        >
          <Avatar className="h-7 w-7 border border-white/10 bg-indigo-950/60 shadow-sm">
            <AvatarFallback className="text-[11px] font-bold text-indigo-300 bg-transparent">
              {initials}
            </AvatarFallback>
          </Avatar>

          {showTriggerLabel && (
            <div className="hidden sm:flex flex-col text-left leading-tight pr-1">
              <span className="text-xs font-medium text-slate-200 truncate max-w-[120px]">
                {user?.name || user?.email || 'Account'}
              </span>
              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                {user?.email || 'Developer'}
              </span>
            </div>
          )}

          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition group-hover:text-slate-300" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-56 bg-[#0e1022] border-white/10 text-slate-200 text-xs shadow-2xl backdrop-blur-xl"
      >
        <DropdownMenuLabel className="font-normal p-2.5">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-semibold text-white leading-none truncate">
              {user?.name || 'Local Developer'}
            </p>
            <p className="text-[11px] text-slate-400 leading-none truncate font-mono">
              {user?.email || 'local@codatron.ai'}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-white/10" />

        <DropdownMenuItem asChild>
          <Link
            href="/profile"
            className="flex items-center justify-between cursor-pointer focus:bg-indigo-600 focus:text-white"
          >
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-indigo-400" />
              <span>View Profile</span>
            </div>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/profile#ai-config"
            className="flex items-center justify-between cursor-pointer focus:bg-indigo-600 focus:text-white"
          >
            <div className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              <span>AI Provider & BYOK</span>
            </div>
            <Badge variant="outline" className="border-indigo-500/30 text-[9px] px-1 py-0 text-indigo-300">
              BYOK
            </Badge>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/profile#usage"
            className="flex items-center justify-between cursor-pointer focus:bg-indigo-600 focus:text-white"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span>Token Usage</span>
            </div>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/profile#credits"
            className="flex items-center justify-between cursor-pointer focus:bg-indigo-600 focus:text-white"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Credits: {creditsRemaining}/{creditLimit}</span>
            </div>
            <Badge
              variant="outline"
              className="border-amber-500/30 text-[9px] px-1 py-0 text-amber-300 font-mono"
            >
              {creditsRemaining} left
            </Badge>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-white/10" />

        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 cursor-pointer text-red-400 focus:bg-red-600 focus:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
