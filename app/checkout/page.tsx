'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Zap,
  Tag,
  Loader2,
  Lock,
  CreditCard,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/components/credit-provider';
import { useAuth } from '@/components/auth-provider';
import { GlobalUserMenu } from '@/components/layout/global-user-menu';
import type { SubscriptionPlan } from '@/lib/types/database';
import { toast } from 'sonner';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIdParam = searchParams.get('plan') || 'pro';
  const initialCoupon = searchParams.get('coupon') || '';

  const { user } = useAuth();
  const { currentPlan, refreshCredits } = useCredits();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [couponCode, setCouponCode] = useState(initialCoupon);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    finalPrice: number;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testOrderState, setTestOrderState] = useState<{
    orderId: string;
    keyId: string;
  } | null>(null);

  // 1. Load Razorpay Checkout Script
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const scriptId = 'razorpay-checkout-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  // 2. Fetch authoritative database plans
  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await fetch('/api/billing/plans');
        if (res.ok) {
          const data = await res.json();
          if (data?.plans && Array.isArray(data.plans)) {
            setPlans(data.plans);
          }
        }
      } catch (err) {
        console.warn('Failed to load plans from database:', err);
      } finally {
        setLoadingPlan(false);
      }
    }
    loadPlans();
  }, []);

  const selectedPlan =
    plans.find((p) => p.id === planIdParam) ||
    (planIdParam === 'premium' || planIdParam === 'business'
      ? {
          id: 'premium',
          name: 'Team Premium',
          price_inr: 999,
          credits: 1200,
          billing_interval: 'month',
          description: 'High throughput for engineering teams shipping multi-page applications.',
          features: [
            '1,200 Codatron AI credits / month',
            'Multi-seat collaboration & shared workspaces',
            'Deep multi-file refactoring & automatic repair loops',
            'Dedicated engineering support & custom models',
          ],
        }
      : {
          id: 'pro',
          name: 'Developer Pro',
          price_inr: 499,
          credits: 500,
          billing_interval: 'month',
          description: 'For active builders creating production-ready web applications.',
          features: [
            '500 Codatron AI credits / month',
            'Up to 50 AI generation & refactoring operations',
            'High-priority generation queues & low latency',
            'Autonomous Product Manager planning & roadmaps',
          ],
        });

  // 3. Auto-validate initial coupon if present in URL
  useEffect(() => {
    if (initialCoupon && selectedPlan) {
      handleApplyCoupon(initialCoupon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCoupon, selectedPlan?.price_inr]);

  const originalPrice = selectedPlan.price_inr;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const finalPrice = appliedCoupon ? appliedCoupon.finalPrice : originalPrice;

  // 4. Server-side coupon validation
  const handleApplyCoupon = async (codeToValidate: string = couponCode) => {
    const code = codeToValidate.trim().toUpperCase();
    if (!code) {
      toast.error('Please enter a coupon code.');
      return;
    }
    setValidatingCoupon(true);
    try {
      const res = await fetch('/api/billing/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          planId: selectedPlan.id,
          planPriceInr: originalPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        toast.error(data.error || 'Invalid or expired coupon code.');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount: data.discountAmount,
          finalPrice: data.finalPrice,
        });
        toast.success(`Coupon ${data.code} applied! Discount: ₹${data.discountAmount}`);
      }
    } catch {
      toast.error('Failed to validate coupon on server.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    toast.info('Coupon removed.');
  };

  // 5. Complete Payment Initiation & Verification Flow
  const handleInitiatePayment = async () => {
    if (!user) {
      toast.error('Please log in before completing payment.');
      router.push(`/login?redirectTo=/checkout?plan=${selectedPlan.id}`);
      return;
    }

    if (currentPlan === selectedPlan.id) {
      toast.info(`You already have an active ${selectedPlan.name} subscription.`);
      return;
    }

    setIsProcessing(true);
    try {
      // Step A: Server-side Razorpay order creation
      const res = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          couponCode: appliedCoupon?.code || null,
        }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.message || 'Failed to initialize payment.');
      }

      const { order } = orderData;
      setTestOrderState({ orderId: order.orderId, keyId: order.keyId });

      // Step B: Launch Razorpay Standard Checkout
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        const options = {
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency || 'INR',
          name: 'Codatron.ai',
          description: `${order.plan.name} Monthly Subscription`,
          image: '/assets/logo.webp',
          order_id: order.orderId,
          handler: async function (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) {
            toast.loading('Verifying secure payment…', { id: 'verify-toast' });
            try {
              // Step C: Authoritative server verification
              const verifyRes = await fetch('/api/payments/razorpay/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              });

              const verifyData = await verifyRes.json();
              toast.dismiss('verify-toast');

              if (!verifyRes.ok || !verifyData.success) {
                toast.error(verifyData.message || 'Payment signature verification failed.');
                return;
              }

              await refreshCredits();
              toast.success('Payment verified! Subscription activated.');
              router.push(
                `/checkout/success?paymentId=${verifyData.razorpayPaymentId}&orderId=${response.razorpay_order_id}&plan=${selectedPlan.id}&amount=${order.finalPrice}&credits=${verifyData.creditsAdded}&coupon=${order.couponCode || ''}`
              );
            } catch (err: unknown) {
              toast.dismiss('verify-toast');
              toast.error(err instanceof Error ? err.message : 'Error verifying payment.');
            }
          },
          modal: {
            ondismiss: function () {
              setIsProcessing(false);
              toast.info('Payment was cancelled. Your plan has not been changed.');
            },
          },
          prefill: {
            email: user?.email || '',
            name: user?.name || '',
          },
          theme: {
            color: '#6366f1',
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (resp: any) {
          setIsProcessing(false);
          toast.error(
            `Payment failed: ${resp.error?.description || 'Your transaction could not be completed.'}`
          );
        });
        rzp.open();
      } else {
        // Fallback test verification button if checkout script blocked
        toast.info('Razorpay modal loaded. Please proceed with payment.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Payment error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper for test sandbox verification simulation
  const handleSimulateTestVerify = async () => {
    if (!testOrderState) return;
    setIsProcessing(true);
    try {
      const testPaymentId = `pay_test_${Date.now()}`;
      const verifyRes = await fetch('/api/payments/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: testOrderState.orderId,
          razorpayPaymentId: testPaymentId,
          razorpaySignature: 'simulated_test_signature',
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.message || 'Simulation verification failed');
      }

      await refreshCredits();
      toast.success('Test payment verified and subscription activated!');
      router.push(
        `/checkout/success?paymentId=${testPaymentId}&orderId=${testOrderState.orderId}&plan=${selectedPlan.id}&amount=${finalPrice}&credits=${selectedPlan.credits}&coupon=${appliedCoupon?.code || ''}`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify test payment.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-black text-white selection:bg-white/20 select-none overflow-x-hidden">
      {/* Background ambient gradient atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent blur-[140px] rounded-full" />
      </div>

      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/12 bg-black/60 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/upgrade"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#28282a] px-3 py-1 text-xs font-medium text-white hover:bg-[#323236] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Plans</span>
          </Link>

          <div className="h-4 w-px bg-white/12" />

          <Link href="/" className="flex items-center gap-2.5 font-bold text-white text-sm hover:opacity-85 transition">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm overflow-hidden p-0.5">
              <img src="/assets/logo.webp" alt="Codatron.ai" className="h-full w-full object-contain" />
            </span>
            <span className="tracking-tight">Codatron.ai</span>
          </Link>

          <span className="text-white/30">/</span>
          <span className="text-xs font-semibold text-slate-300">Secure Checkout</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            <Lock className="h-3 w-3" />
            <span>256-Bit SSL Encrypted</span>
          </div>
          <GlobalUserMenu />
        </div>
      </header>

      {/* Main Checkout Container */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2 pt-2">
          <Badge
            variant="outline"
            className="rounded-full border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs px-3.5 py-1 font-medium gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Official Razorpay Payment Gateway</span>
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Complete Your Upgrade
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Review your selected plan and promo coupon before proceeding to Razorpay checkout.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Plan Summary Card (Left Col - 3 spans) */}
          <Card className="md:col-span-3 rounded-[28px] border border-white/12 bg-black/40 backdrop-blur-xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/8 pb-5">
              <div>
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Selected Subscription Tier
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  {selectedPlan.name}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {selectedPlan.description}
                </p>
              </div>
              <Badge className="bg-indigo-600/30 text-indigo-300 border-indigo-500/30 text-xs font-mono">
                ₹{selectedPlan.price_inr} / {selectedPlan.billing_interval || 'month'}
              </Badge>
            </div>

            {/* Plan Credit Allowance Highlight */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Monthly Credit Allowance</p>
                  <p className="text-[11px] text-zinc-400">Directly synchronized with your IDE balance</p>
                </div>
              </div>
              <span className="text-sm font-bold text-amber-400 font-mono">
                {selectedPlan.credits} Credits
              </span>
            </div>

            {/* Included Features */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                What’s Included:
              </p>
              <ul className="space-y-2.5 text-xs text-zinc-300">
                {(Array.isArray(selectedPlan.features) ? (selectedPlan.features as string[]) : []).map(
                  (feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          </Card>

          {/* Checkout & Coupon Card (Right Col - 2 spans) */}
          <Card className="md:col-span-2 rounded-[28px] border border-indigo-500/30 bg-gradient-to-b from-indigo-950/20 via-black/50 to-black/60 backdrop-blur-xl p-6 sm:p-7 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-5">
              <div className="border-b border-white/8 pb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-indigo-400" />
                  <span>Order Summary</span>
                </h3>
              </div>

              {/* Promo Coupon Section */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-400" />
                  <span>Have a promo coupon?</span>
                </label>

                {appliedCoupon ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-emerald-400 font-mono">{appliedCoupon.code}</span>
                      <p className="text-[10px] text-emerald-300/80">
                        {appliedCoupon.discountType === 'percent'
                          ? `${appliedCoupon.discountValue}% Discount Applied`
                          : `₹${appliedCoupon.discountValue} Off`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveCoupon}
                      className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="e.g. WELCOME20"
                      className="bg-black/50 border-white/10 text-amber-300 font-mono text-xs h-9 uppercase rounded-xl"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleApplyCoupon()}
                      disabled={validatingCoupon}
                      className="h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs px-3 shrink-0"
                    >
                      {validatingCoupon ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Price Calculation Breakdown */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Original Plan Price</span>
                  <span className="font-mono text-white">₹{originalPrice.toFixed(2)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-emerald-400">
                    <span>Discount ({appliedCoupon?.code})</span>
                    <span className="font-mono">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="h-px bg-white/10 my-2" />

                <div className="flex items-center justify-between text-sm font-bold text-white">
                  <span>Final Amount to Pay</span>
                  <span className="font-mono text-emerald-400 text-base">₹{finalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-4">
              <Button
                onClick={handleInitiatePayment}
                disabled={isProcessing || loadingPlan}
                className="w-full rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold h-11 shadow-lg shadow-emerald-500/20 transition active:scale-95 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Preparing Secure Payment…</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    <span>Continue to Payment (₹{finalPrice.toFixed(2)})</span>
                  </>
                )}
              </Button>

              {testOrderState && (
                <Button
                  onClick={handleSimulateTestVerify}
                  disabled={isProcessing}
                  variant="outline"
                  className="w-full rounded-full border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-[11px] h-9"
                >
                  Verify Sandbox Test Order Now
                </Button>
              )}

              <p className="text-[10px] text-center text-zinc-500 leading-relaxed">
                Supports UPI, Google Pay, Cards, NetBanking, and Wallets via Razorpay Secure.
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white text-xs">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
