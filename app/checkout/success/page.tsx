'use client';

import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Zap, ArrowRight, ShieldCheck, Tag, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/components/credit-provider';

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId') || 'rzp_sample_success';
  const orderId = searchParams.get('orderId');
  const planId = searchParams.get('plan') || 'pro';
  const amount = searchParams.get('amount') || '499.00';
  const credits = searchParams.get('credits') || (planId === 'pro' ? '500' : '1200');
  const coupon = searchParams.get('coupon');

  const { refreshCredits } = useCredits();

  useEffect(() => {
    // Refresh authoritative credits and plan state immediately
    void refreshCredits();
  }, [refreshCredits]);

  const planName = planId === 'premium' || planId === 'business' ? 'Codatron Team' : 'Codatron Pro';

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-black text-white selection:bg-white/20 select-none p-4">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-indigo-500/10 to-transparent blur-[140px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Payment Successful!
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Welcome to <span className="text-emerald-400 font-semibold">{planName}</span>. Your subscription is active and credits are loaded into your workspace.
          </p>
        </div>

        <Card className="rounded-[28px] border border-white/12 bg-black/50 backdrop-blur-xl p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/8 pb-4">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Subscription Tier</span>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
              {planId === 'premium' || planId === 'business' ? 'Team Premium' : 'Developer Pro'}
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>Monthly Credits Granted</span>
              </span>
              <span className="font-bold text-white font-mono">{credits} credits / month</span>
            </div>

            <div className="flex items-center justify-between text-zinc-400">
              <span>Amount Paid</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">₹{Number(amount).toFixed(2)}</span>
            </div>

            {coupon && (
              <div className="flex items-center justify-between text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-400" />
                  <span>Coupon Applied</span>
                </span>
                <span className="font-mono text-amber-300">{coupon}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-zinc-400">
              <span>Razorpay Payment ID</span>
              <span className="font-mono text-zinc-300 text-[11px]">{paymentId}</span>
            </div>

            {orderId && (
              <div className="flex items-center justify-between text-zinc-400">
                <span>Razorpay Order ID</span>
                <span className="font-mono text-zinc-300 text-[11px]">{orderId}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Your subscription and credits are instantly synchronized across your IDE, Product Manager workspace, and account settings.
            </p>
          </div>

          <div className="pt-2">
            <Link href="/projects" className="w-full block">
              <Button className="w-full rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold h-11 shadow-lg transition active:scale-95 flex items-center justify-center gap-2">
                <span>Go to Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white text-xs">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
