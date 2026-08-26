import { useEffect } from "react";
import anime from "animejs";
import { Package } from "lucide-react";

export default function LoadingScreen({ onFinished }: { onFinished?: () => void }) {
  useEffect(() => {
    // Fluid premium sequence — overlapping, spring, shimmer
    const tl = anime.timeline({ easing: "easeOutExpo" });

    // Background grid gentle fade
    anime({
      targets: ".loading-grid",
      opacity: [0, 1],
      duration: 600,
      easing: "easeOutQuad",
    });

    tl.add({
      targets: ".loading-mark",
      scale: [0.84, 1],
      opacity: [0, 1],
      duration: 640,
      easing: "spring(1, 78, 10, 0)",
    })
      .add(
        {
          targets: ".loading-title span",
          translateY: [14, 0],
          opacity: [0, 1],
          delay: anime.stagger(38, { start: 60 }),
          duration: 560,
          easing: "spring(1, 82, 12, 0)",
        },
        "-=420",
      )
      .add(
        {
          targets: ".loading-subtitle",
          translateY: [8, 0],
          opacity: [0, 1],
          duration: 480,
          easing: "easeOutExpo",
        },
        "-=380",
      )
      .add(
        {
          targets: ".loading-bar",
          scaleX: [0.92, 1],
          opacity: [0, 1],
          duration: 420,
          easing: "easeOutExpo",
        },
        "-=320",
      )
      .add(
        {
          targets: ".loading-bar-inner",
          scaleX: [0, 1],
          duration: 980,
          easing: "easeInOutExpo",
        },
        "-=360",
      )
      .add(
        {
          targets: ".loading-secure",
          translateY: [6, 0],
          opacity: [0, 1],
          duration: 420,
          easing: "easeOutQuad",
        },
        "-=520",
      );

    // Fluid continuous — ring rotate + subtle breathe for mark
    anime({
      targets: ".loading-ring",
      rotate: "1turn",
      duration: 2800,
      loop: true,
      easing: "linear",
    });
    anime({
      targets: ".loading-mark",
      scale: [1, 1.015, 1],
      duration: 1800,
      loop: true,
      direction: "alternate",
      easing: "easeInOutSine",
      delay: 700,
    });
    // Shimmer sweep across bar
    anime({
      targets: ".loading-shimmer",
      translateX: ["-100%", "220%"],
      duration: 1100,
      delay: 680,
      loop: true,
      easing: "easeInOutSine",
      loopComplete: () => {},
    });
    // Package icon subtle pulse
    anime({
      targets: ".loading-mark svg",
      scale: [1, 1.06, 1],
      duration: 1600,
      loop: true,
      direction: "alternate",
      easing: "easeInOutQuad",
      delay: 400,
    });

    const fallback = window.setTimeout(() => onFinished?.(), 1750);
    return () => window.clearTimeout(fallback);
  }, [onFinished]);

  return (
    <div className="loading-screen fixed inset-0 z-[100] grid place-items-center bg-[#f3f4ed] dark:bg-[#0e1210] overflow-hidden">
      <div className="loading-grid absolute inset-0 opacity-[0.04] dark:opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(52,91,74,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(52,91,74,0.08) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#f3f4ed]/40 dark:to-[#0e1210]/40 pointer-events-none" />
      <div className="relative flex flex-col items-center gap-7">
        <div className="loading-mark relative grid place-items-center">
          <div className="loading-ring absolute inset-0 -m-3 rounded-full border border-[#267e79]/12" style={{ width: "64px", height: "64px", left: "-10px", top: "-10px" }} />
          <div className="absolute inset-0 -m-3 rounded-full border border-dashed border-[#267e79]/10" style={{ width: "64px", height: "64px", left: "-10px", top: "-10px" }} />
          <div className="h-[44px] w-[44px] rounded-[10px] bg-[#267e79] dark:bg-[#3aa79f] grid place-items-center shadow-[0_8px_24px_rgba(38,126,121,0.22)] border border-[#267e79] dark:border-[#3aa79f]">
            <Package size={18} strokeWidth={2} className="text-white dark:text-[#0e1210]" />
          </div>
        </div>
        <div className="loading-title text-center">
          <div className="flex gap-[2px] justify-center">
            {"VAULT".split("").map((ch, i) => (
              <span key={i} className="font-mono text-[15px] tracking-[0.18em] font-bold text-[#172019] dark:text-[#e8e9e3]">
                {ch}
              </span>
            ))}
          </div>
          <div className="loading-subtitle mt-1.5 font-mono text-[11px] tracking-[0.16em] text-[#3a4a43] dark:text-[#9aa6a1]">COLD-CHAIN / 01 — INITIALIZING</div>
        </div>
        <div className="loading-bar h-[2px] w-[168px] overflow-hidden rounded-full bg-[#e6ebe4] dark:bg-[#1e2623] relative">
          <div className="loading-bar-inner h-full w-full origin-left bg-[#267e79] dark:bg-[#3aa79f] rounded-full" />
          <div className="loading-shimmer absolute inset-y-0 left-0 w-[48px] bg-gradient-to-r from-transparent via-white/35 dark:via-white/18 to-transparent -translate-x-full" />
        </div>
        <div className="loading-secure font-mono text-[10px] tracking-[0.12em] text-[#667068] dark:text-[#7a8a84]">SECURE • VERIFIED • LOCAL</div>
      </div>
    </div>
  );
}
