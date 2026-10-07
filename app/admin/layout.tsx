'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  BarChart3,
  Cpu,
  AlertTriangle,
  Activity,
  Zap,
  History,
  Settings,
  Shield,
  ArrowLeft,
  LogOut,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  CreditCard,
  Tag,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/ai-usage', label: 'AI Usage', icon: BarChart3 },
  { href: '/admin/providers', label: 'AI Providers', icon: Cpu },
  { href: '/admin/plans', label: 'Plans & Pricing', icon: CreditCard },
  { href: '/admin/coupons', label: 'Coupons', icon: Tag },
  { href: '/admin/payments', label: 'Payments & Subscriptions', icon: WalletCards },
  { href: '/admin/errors', label: 'Error Center', icon: AlertTriangle },
  { href: '/admin/system-health', label: 'System Health', icon: Activity },
  { href: '/admin/credits', label: 'User Credits', icon: Zap },
  { href: '/admin/activity', label: 'Activity Logs', icon: History },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminStatus() {
      try {
        setCheckingAdmin(true);
        const res = await fetch('/api/admin/me');
        if (!isMounted) return;

        if (res.status === 401) {
          router.replace('/login?redirect=/admin');
          return;
        }

        if (res.status === 403) {
          setIsAdmin(false);
          setErrorMessage('Access denied. Administrator privileges required.');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.isAdmin) {
            setIsAdmin(true);
            setErrorMessage(null);
          } else {
            setIsAdmin(false);
            setErrorMessage('Access denied. Administrator privileges required.');
          }
        } else {
          setIsAdmin(false);
          setErrorMessage('Unable to verify administrator session.');
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setIsAdmin(false);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to verify admin authorization');
      } finally {
        if (isMounted) setCheckingAdmin(false);
      }
    }

    void checkAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      router.push('/login');
    } catch {
      toast.error('Failed to log out');
    }
  };

  // Loading state with clean skeleton
  if (authLoading || checkingAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0e0e11] text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
          <p className="text-xs font-mono text-zinc-400">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  // Unauthorized state (403 Forbidden)
  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0e0e11] p-6 text-zinc-100">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-red-950/10 p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-2">Access Denied</h1>
          <p className="text-sm text-zinc-400 mb-6">
            {errorMessage || 'Your account does not possess administrator credentials to access this control center.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              asChild
              className="border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              <Link href="/projects">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Projects
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'AD';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0d0d11] text-zinc-200 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Admin Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-white/8 bg-[#121217] transition-all">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/8">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white">Codatron</span>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  ADMIN
                </Badge>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">Control Center</span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Operations & Health
          </div>

          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User & Exit to App Footer */}
        <div className="p-3 border-t border-white/8 space-y-2 bg-[#0e0e13]">
          <Link
            href="/projects"
            className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/6 transition group"
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition" />
              <span>Back to App</span>
            </div>
            <ExternalLink className="h-3 w-3 opacity-40 group-hover:opacity-100" />
          </Link>

          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="h-7 w-7 rounded-lg border border-white/10 bg-emerald-500/10">
                <AvatarFallback className="text-[10px] font-bold text-emerald-400 bg-transparent">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-white truncate max-w-[110px]">
                  {user?.email}
                </p>
                <p className="text-[9px] text-emerald-400 font-mono">Privileged Admin</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Administrative Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0d0d11]">
        {/* Top Header Bar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/8 bg-[#121217]/80 backdrop-blur-md flex-shrink-0 z-10">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <Link href="/admin" className="hover:text-zinc-200 transition">
              Admin
            </Link>
            {pathname !== '/admin' && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-200 capitalize">
                  {pathname === '/admin/payments'
                    ? 'Payments & Subscriptions'
                    : pathname.split('/admin/')[1]?.replace('-', ' ')}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden sm:inline-flex items-center gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] py-1 px-2.5 font-mono"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              className="h-8 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </Button>
          </div>
        </header>

        {/* Scrollable Dashboard Viewport */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
