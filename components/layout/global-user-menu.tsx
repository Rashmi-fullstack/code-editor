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
  Shield,
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
  const { user, logout, isAdmin: authIsAdmin } = useAuth();
  const { creditsRemaining, creditLimit, isAdmin: creditsIsAdmin } = useCredits();
  const [isAdminState, setIsAdminState] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (user) {
      fetch('/api/admin/me')
        .then((res) => {
          if (!res.ok) {
            if (active) setIsAdminState(false);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (active) {
            setIsAdminState(Boolean(data?.isAdmin));
          }
        })
        .catch(() => {
          if (active) setIsAdminState(false);
        });
    } else {
      setIsAdminState(false);
    }
    return () => {
      active = false;
    };
  }, [user]);

  // Backend is the source of truth: only consider user admin if /api/admin/me canonically authorized
  const isAdmin = Boolean(isAdminState);

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
          className={`group flex items-center gap-2 rounded-full border border-white/12 bg-[#28282a] p-1 sm:pr-3 transition hover:bg-[#323236] focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer ${className}`}
          title={user?.email || 'User Account'}
        >
          <Avatar className="h-7 w-7 rounded-full border border-white/20 bg-white/10 shadow-sm">
            <AvatarFallback className="text-[11px] font-bold text-white bg-transparent">
              {initials}
            </AvatarFallback>
          </Avatar>

          {showTriggerLabel && (
            <div className="hidden sm:flex flex-col text-left leading-tight pr-1">
              <span className="text-xs font-medium text-white truncate max-w-[120px]">
                {user?.name || user?.email || 'Account'}
              </span>
              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                {user?.email || 'Developer'}
              </span>
            </div>
          )}

          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-white" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className="w-56 rounded-2xl bg-[#18181a]/95 border border-white/12 text-slate-200 text-xs shadow-2xl backdrop-blur-2xl p-1.5"
      >
        <DropdownMenuLabel className="font-normal p-2.5">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-semibold text-white leading-none truncate">
              {isAdmin ? 'Administrator' : (user?.name || 'User')}
            </p>
            <p className="text-[11px] text-slate-400 leading-none truncate font-mono">
              {user?.email || 'local@codatron.ai'}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-white/10 my-1" />

        {isAdmin ? (
          <>
            <DropdownMenuItem asChild>
              <Link
                href="/admin"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition font-medium"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Admin Panel</span>
                </div>
                <Badge variant="outline" className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-[9px] px-2 py-0 text-emerald-300 font-mono">
                  ADMIN
                </Badge>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>View Profile</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/profile#ai-config"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-amber-400" />
                  <span>AI Provider & BYOK</span>
                </div>
                <Badge variant="outline" className="rounded-full border-white/15 bg-white/10 text-[9px] px-2 py-0 text-white font-mono">
                  BYOK
                </Badge>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/profile#credits"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition font-medium"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>∞ Unlimited Credits</span>
                </div>
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>View Profile</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/profile#ai-config"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-amber-400" />
                  <span>AI Provider & BYOK</span>
                </div>
                <Badge variant="outline" className="rounded-full border-white/15 bg-white/10 text-[9px] px-2 py-0 text-white font-mono">
                  BYOK
                </Badge>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/profile#usage"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
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
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-slate-200 hover:text-white hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>Credits: {creditsRemaining}/{creditLimit}</span>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/10 text-[9px] px-2 py-0 text-amber-300 font-mono"
                >
                  {creditsRemaining} left
                </Badge>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/upgrade"
                className="flex items-center justify-between rounded-xl px-2.5 py-2 cursor-pointer text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 transition font-medium"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Upgrade Plan</span>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-indigo-500/30 bg-indigo-500/10 text-[9px] px-2 py-0 text-indigo-300 font-mono"
                >
                  Plans
                </Badge>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="bg-white/10 my-1" />

        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
