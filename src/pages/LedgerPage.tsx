import { useEffect, useState } from "react";
import anime from "animejs";
import { BadgeCheck, ArrowRight, Copy, CheckCircle2, FileText, Download } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const fullLedgerSeed = [
  { sequence: "042", event: "TEMPERATURE_READING", time: "14:20:02", status: "VALID", hash: "8f2a9c91d4e6b0c91d", fullHash: "8f2a9c91d4e6b0c91d8f2a9c91d4e6b0c91d" },
  { sequence: "041", event: "TEMPERATURE_READING", time: "14:10:02", status: "VALID", hash: "2b1180a484f3c0a48", fullHash: "2b1180a484f3c0a482b1180a484f3c0a48" },
  { sequence: "040", event: "TEMPERATURE_READING", time: "14:00:02", status: "VALID", hash: "b728f0e2a91d4f0e2", fullHash: "b728f0e2a91d4f0e2b728f0e2a91d4f0e2" },
  { sequence: "039", event: "TEMPERATURE_READING", time: "13:50:02", status: "VALID", hash: "a119c4d8e0f2a119", fullHash: "a119c4d8e0f2a119a119c4d8e0f2a119" },
  { sequence: "038", event: "EXCURSION_CHECK", time: "13:40:02", status: "VALID", hash: "c44b0a8f1e3c44b", fullHash: "c44b0a8f1e3c44b0c44b0a8f1e3c44b" },
  { sequence: "037", event: "TEMPERATURE_READING", time: "13:30:02", status: "VALID", hash: "9d2f1b6c8a9d2f1b", fullHash: "9d2f1b6c8a9d2f1b9d2f1b6c8a9d2f1b" },
  { sequence: "036", event: "HANDOFF_INIT", time: "13:20:02", status: "VALID", hash: "e0f2c4d8a91e0f2c4", fullHash: "e0f2c4d8a91e0f2c4e0f2c4d8a91e0f2c4" },
  { sequence: "035", event: "TEMPERATURE_READING", time: "13:10:02", status: "VALID", hash: "f1b6c8a9d2f1b6c8", fullHash: "f1b6c8a9d2f1b6c8f1b6c8a9d2f1b6c8" },
  { sequence: "034", event: "TEMPERATURE_READING", time: "13:00:02", status: "VALID", hash: "7c8a9d2f1b6c7c8a", fullHash: "7c8a9d2f1b6c7c8a7c8a9d2f1b6c7c8a" },
  { sequence: "033", event: "SHIPMENT_CREATE", time: "12:42:17", status: "VALID", hash: "d4e6b0c91d8f2a9c", fullHash: "d4e6b0c91d8f2a9cd4e6b0c91d8f2a9c" },
];

export default function LedgerPage() {
  const { ledgerRows } = useColdChain();
  const [fullOpen, setFullOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    anime
      .timeline({ easing: "easeOutExpo" })
      .add({
        targets: ".ledger-heading h2, .ledger-heading .eyebrow",
        translateY: [12, 0],
        opacity: [0, 1],
        delay: anime.stagger(70),
        duration: 560,
      })
      .add(
        {
          targets: "[data-slot='table-row']",
          translateY: [10, 0],
          opacity: [0, 1],
          delay: anime.stagger(80),
          duration: 520,
        },
        "-=320",
      );

    return () => anime.remove(".ledger-heading h2, .ledger-heading .eyebrow, [data-slot='table-row']");
  }, []);

  const handleCopy = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <section className="ledger-section" id="ledger">
      <div className="section-heading ledger-heading">
        <div>
          <div className="eyebrow">02 / IMMUTABLE TRAIL</div>
          <h2>Every reading leaves a mark.</h2>
        </div>
        <button type="button" onClick={() => setFullOpen(true)} className="text-link inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] text-[#1d5d59] dark:text-[#7ec8c1] border-b border-[#267e79] dark:border-[#3aa79f] pb-[5px] hover:text-[#267e79] dark:hover:text-[#3aa79f] transition-colors">
          OPEN FULL LEDGER <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="rounded-lg border border-[#9ea99e] dark:border-[#2a352f] bg-white dark:bg-[#171c19] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#f7f8f4] dark:bg-[#1c2220]">
            <TableRow className="border-b border-[#cbd2c6] dark:border-[#2a352f] hover:bg-transparent">
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground dark:text-[#9aa6a1]">SEQ</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground dark:text-[#9aa6a1]">ENTRY TYPE</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground dark:text-[#9aa6a1]">UTC TIMESTAMP</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground dark:text-[#9aa6a1]">STATUS</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground dark:text-[#9aa6a1]">HASH</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerRows.map((row, index) => (
              <TableRow key={row.sequence} className="border-b border-[#cbd2c6] dark:border-[#2a352f] hover:bg-[#f7f8f4]/50 dark:hover:bg-[#1c2220]/60">
                <TableCell className="font-mono text-[9px] text-[#267e79] dark:text-[#3aa79f] font-semibold">{row.sequence}</TableCell>
                <TableCell className="font-mono text-[10px] text-[#172019] dark:text-[#e8e9e3]">{row.event}</TableCell>
                <TableCell className="font-mono text-[9px] text-muted-foreground dark:text-[#9aa6a1]">2026-08-26 / {row.time}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border-[#cbd2c6] dark:border-[#2a352f] font-mono text-[9px] gap-1">
                    <BadgeCheck size={12} className="text-[#318b5d] dark:text-[#5ac18a]" aria-hidden="true" />
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-[9px] text-muted-foreground dark:text-[#9aa6a1] flex items-center gap-1.5">
                  {index === 0 ? "8f2a...c91d" : index === 1 ? "2b11...0a48" : "b728...f0e2"}
                  <button onClick={() => handleCopy(index === 0 ? "8f2a9c91d4e6b0c91d" : index === 1 ? "2b1180a484f3c0a48" : "b728f0e2a91d4f0e2")} className="p-1 rounded hover:bg-[#f7f8f4] dark:hover:bg-[#1c2220]" aria-label="Copy hash">
                    {copied === (index === 0 ? "8f2a9c91d4e6b0c91d" : index === 1 ? "2b1180a484f3c0a48" : "b728f0e2a91d4f0e2") ? <CheckCircle2 size={10} className="text-[#318b5d] dark:text-[#5ac18a]" /> : <Copy size={10} className="text-[#667068] dark:text-[#7a8a84]" />}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-w-[720px] max-h-[82vh] overflow-hidden bg-white dark:bg-[#171c19] p-0 gap-0 border dark:border-[#2a352f]">
          <DialogHeader className="p-6 pb-3 border-b border-[#e6ebe4] dark:border-[#2a352f]">
            <DialogTitle className="font-mono text-[11px] tracking-[0.12em] flex items-center gap-2 dark:text-[#e8e9e3]">
              <FileText size={14} className="text-[#267e79] dark:text-[#3aa79f]" /> FULL LEDGER — IMMUTABLE TRAIL
            </DialogTitle>
            <DialogDescription className="font-mono text-[9px] text-[#5a6a62] dark:text-[#9aa6a1]">All 10 entries, verified hashes. Click hash to copy full value. Export for audit.</DialogDescription>
          </DialogHeader>

          <div className="overflow-auto max-h-[52vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-[#f7f8f4] dark:bg-[#1c2220] z-10">
                <TableRow className="hover:bg-transparent border-b dark:border-[#2a352f]">
                  <TableHead className="font-mono text-[8px] dark:text-[#9aa6a1]">SEQ</TableHead>
                  <TableHead className="font-mono text-[8px] dark:text-[#9aa6a1]">ENTRY TYPE</TableHead>
                  <TableHead className="font-mono text-[8px] dark:text-[#9aa6a1]">TIMESTAMP</TableHead>
                  <TableHead className="font-mono text-[8px] dark:text-[#9aa6a1]">STATUS</TableHead>
                  <TableHead className="font-mono text-[8px] dark:text-[#9aa6a1]">HASH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullLedgerSeed.map((row) => (
                  <TableRow key={row.sequence} className="hover:bg-[#f7f8f4]/60 dark:hover:bg-[#1c2220]/60 border-b dark:border-[#2a352f]">
                    <TableCell className="font-mono text-[9px] font-bold text-[#267e79] dark:text-[#3aa79f]">{row.sequence}</TableCell>
                    <TableCell className="font-mono text-[9px] text-[#172019] dark:text-[#e8e9e3]">{row.event}</TableCell>
                    <TableCell className="font-mono text-[9px] text-muted-foreground dark:text-[#9aa6a1]">2026-08-26 / {row.time}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border dark:border-[#2a352f] text-[8px] h-5 gap-1">
                        <BadgeCheck size={10} /> {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[8px]">
                      <button onClick={() => handleCopy(row.fullHash)} className="inline-flex items-center gap-1.5 rounded border border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#1c2220] px-2 py-1 hover:bg-white dark:hover:bg-[#24302c] transition-colors dark:text-[#e8e9e3]">
                        <span className="truncate max-w-[110px]">{row.hash}</span>
                        {copied === row.fullHash ? <CheckCircle2 size={10} className="text-[#318b5d] dark:text-[#5ac18a] shrink-0" /> : <Copy size={10} className="text-[#667068] dark:text-[#7a8a84] shrink-0" />}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#1c2220] flex items-center justify-between gap-3">
            <div className="font-mono text-[8px] text-[#5a6a62] dark:text-[#9aa6a1]">{fullLedgerSeed.length} entries • verified • chain intact</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFullOpen(false)} className="font-mono text-[9px] h-7">
                CLOSE
              </Button>
              <Button
                size="sm"
                className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[9px] h-7 gap-1.5"
                onClick={async () => {
                  const csv = `SEQ,ENTRY TYPE,TIMESTAMP,STATUS,HASH\n${fullLedgerSeed.map((r) => `${r.sequence},${r.event},2026-08-26 ${r.time},${r.status},${r.fullHash}`).join("\n")}`;
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "vault-ledger-2026-08-26.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={12} /> EXPORT CSV
              </Button>
            </div>
          </div>
          {copied && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#172019] text-white text-[9px] font-mono px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-lg">
              <CheckCircle2 size={12} className="text-[#7ec8a1]" /> Copied {copied.slice(0, 8)}…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
