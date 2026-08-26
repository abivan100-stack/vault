import { useEffect } from "react";
import anime from "animejs";
import { Shield } from "lucide-react";

export default function LoadingScreen({ onFinished }: { onFinished?: () => void }) {
  useEffect(() => {
    const tl = anime.timeline({ easing: "easeOutExpo" });
    tl.add({
      targets: ".loading-mark",
      scale: [0.88, 1],
      opacity: [0, 1],
      duration: 520,
    })
      .add(
        {
          targets: ".loading-title span",
          translateY: [10, 0],
          opacity: [0, 1],
          delay: anime.stagger(45),
          duration: 460,
        },
        "-=320",
      )
      .add(
        {
          targets: ".loading-bar-inner",
          scaleX: [0, 1],
          duration: 820,
          easing: "easeInOutExpo",
        },
        "-=320",
      );

    anime({
      targets: ".loading-ring",
      rotate: "1turn",
      duration: 2200,
      loop: true,
      easing: "linear",
    });

    const fallback = window.setTimeout(() => onFinished?.(), 1600);
    return () => window.clearTimeout(fallback);
  }, [onFinished]);

  return (
    <div className="loading-screen fixed inset-0 z-[100] grid place-items-center bg-[#f3f4ed] dark:bg-[#0e1210] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(52,91,74,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(52,91,74,0.08) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative flex flex-col items-center gap-7">
        <div className="loading-mark relative grid place-items-center">
          <div className="loading-ring absolute inset-0 -m-3 rounded-full border border-[#267e79]/20 border-t-[#267e79]/60 border-dashed" style={{ width: "68px", height: "68px", left: "-10px", top: "-10px" }} />
          <div className="h-[48px] w-[48px] rounded-[12px] bg-gradient-to-br from-[#2e9e98] via-[#267e79] to-[#1b5a56] grid place-items-center shadow-[0_8px_24px_rgba(38,126,121,0.28)] border border-white/15">
            <Shield size={20} strokeWidth={2.2} className="text-white" />
          </div>
        </div>
        <div className="loading-title text-center">
          <div className="flex gap-[2px] justify-center">
            {"VAULT".split("").map((ch, i) => (
              <span key={i} className="font-mono text-[13px] tracking-[0.18em] font-bold text-[#172019] dark:text-[#e8e9e3]">
                {ch}
              </span>
            ))}
          </div>
          <div className="mt-1.5 font-mono text-[8px] tracking-[0.16em] text-[#3a4a43] dark:text-[#9aa6a1]">COLD-CHAIN / 01 — INITIALIZING</div>
        </div>
        <div className="loading-bar h-[2px] w-[160px] overflow-hidden rounded-full bg-[#e6ebe4] dark:bg-[#1e2623]">
          <div className="loading-bar-inner h-full w-full origin-left bg-gradient-to-r from-[#267e79] to-[#1b5a56] rounded-full" />
        </div>
        <div className="font-mono text-[7px] tracking-[0.12em] text-[#667068] dark:text-[#7a8a84]">SECURE • VERIFIED • LOCAL</div>
      </div>
    </div>
  );
}
