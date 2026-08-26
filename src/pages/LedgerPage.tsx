import { useEffect, useState, useMemo } from "react";
import anime from "animejs";
import { BadgeCheck, ArrowRight, Copy, CheckCircle2, FileText, Download, Search, Filter } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "TEMPERATURE_READING">("all");

  const filtered = useMemo(() => {
    let rows = ledgerRows;
    if (filter !== "all") rows = rows.filter((r) => r.event === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => r.sequence.includes(q) || r.event.toLowerCase().includes(q) || r.time.includes(q));
    }
    return rows;
  }, [ledgerRows, query, filter]);

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
          delay: anime.stagger(60),
          duration: 480,
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
      // clipboard unavailable — keep the row state unchanged
    }
  };

  return (
    <section className="ledger-section space-y-0" id="ledger">
      <div className="section-heading ledger-heading">
        <div>
          <div className="eyebrow">02 / IMMUTABLE TRAIL</div>
          <h2>Every reading leaves a mark.</h2>
          <p className="mt-1.5 font-mono text-[12px] leading-[1.5] text-[#5a6a62] dark:text-[#9aa6a1] max-w-[520px]">Append-only ledger — each temperature is hashed and sequenced. Search, copy, or export for audit.</p>
        </div>
        <button type="button" onClick={() => setFullOpen(true)} className="text-link inline-flex items-center gap-1.5 font-mono text-[12px] tracking-[0.08em] text-[#1d5d59] dark:text-[#7ec8c1] border-b border-[#267e79] dark:border-[#3aa79f] pb-[5px] hover:text-[#267e79] dark:hover:text-[#3aa79f] transition-colors shrink-0">
          OPEN FULL LEDGER <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Toolbar — makes ledger user-friendly */}
      <div className="mb-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-[420px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa6a1]" />
            <Input placeholder="Search SEQ, event, time…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8 font-mono text-[13px] bg-white dark:bg-[#171c19] border-[#cbd2c6] dark:border-[#2a352f]" />
          </div>
          <Button
            variant={filter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilter(filter === "all" ? "TEMPERATURE_READING" : "all")}
            className="h-8 font-sans text-[14px] font-medium rounded-full gap-1.5 shrink-0"
          >
            <Filter size={15} /> {filter === "all" ? "All" : "Temp only"}
          </Button>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-[#667068] dark:text-[#7a8a84]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#318b5d] dark:bg-[#5ac18a]" /> {filtered.length} shown • {ledgerRows.length} in view • chain intact
        </div>
      </div>

      <div className="rounded-xl border border-[#9ea99e] dark:border-[#2a352f] bg-white dark:bg-[#171c19] overflow-hidden shadow-[0_4px_16px_rgba(23,32,25,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
        <Table>
          <TableHeader className="bg-[#f7f8f4] dark:bg-[#1c2220]">
            <TableRow className="border-b border-[#cbd2c6] dark:border-[#2a352f] hover:bg-transparent">
              <TableHead className="w-[72px] font-sans text-[13px] font-semibold tracking-[-0.01em] text-[#1d5d59] dark:text-[#7ec8c1]">SEQ</TableHead>
              <TableHead className="font-sans text-[13px] font-semibold tracking-[-0.01em] text-[#1d5d59] dark:text-[#7ec8c1]">Entry</TableHead>
              <TableHead className="font-sans text-[13px] font-semibold tracking-[-0.01em] text-[#1d5d59] dark:text-[#7ec8c1]">Timestamp</TableHead>
              <TableHead className="font-sans text-[13px] font-semibold tracking-[-0.01em] text-[#1d5d59] dark:text-[#7ec8c1]">Status</TableHead>
              <TableHead className="font-sans text-[13px] font-semibold tracking-[-0.01em] text-[#1d5d59] dark:text-[#7ec8c1] text-right">Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center font-mono text-[12px] text-[#9aa6a1]">
                  No entries match “{query}”.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, index) => (
                <TableRow key={row.sequence} className="border-b border-[#e6ebe4] dark:border-[#2a352f] hover:bg-[#f7f8f4]/60 dark:hover:bg-[#1c2220]/60 transition-colors group">
                  <TableCell className="py-3.5 font-mono text-[14px] font-bold tracking-[-0.02em] text-[#267e79] dark:text-[#3aa79f]">{row.sequence}</TableCell>
                  <TableCell className="py-3.5">
                    <div className="font-sans text-[15px] font-medium leading-none text-[#172019] dark:text-[#e8e9e3]">{row.event.replace("_", " ")}</div>
                    <div className="font-mono text-[12px] text-[#7a8a84]">TEMPERATURE_READING</div>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <div className="font-sans text-[14px] font-medium text-[#172019] dark:text-[#e8e9e3]">2026-08-26</div>
                    <div className="font-mono text-[13px] text-[#5a6a62] dark:text-[#9aa6a1]">{row.time} UTC+05:30</div>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border-[#cbd2c6] dark:border-[#2a352f] font-sans text-[13px] font-medium gap-1.5 px-2.5 py-0 h-6 rounded-full">
                      <BadgeCheck size={16} className="text-[#318b5d] dark:text-[#5ac18a]" aria-hidden="true" />
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 text-right">
                    <button onClick={() => handleCopy(index === 0 ? "8f2a9c91d4e6b0c91d" : index === 1 ? "2b1180a484f3c0a48" : "b728f0e2a91d4f0e2")} className="inline-flex items-center gap-2 rounded-full border border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#0e1210] px-2.5 py-1.5 hover:bg-white dark:hover:bg-[#1e2623] transition-colors group/hash">
                      <span className="font-mono text-[13px] tracking-[-0.01em] text-[#33413d] dark:text-[#c8d5d0]">{index === 0 ? "8f2a…c91d" : index === 1 ? "2b11…0a48" : "b728…f0e2"}</span>
                      <span className="hidden sm:inline font-mono text-[12px] text-[#9aa6a1] group-hover/hash:text-[#267e79] dark:group-hover/hash:text-[#3aa79f]">{index === 0 ? "8f2a9c..." : ""}</span>
                      {copied === (index === 0 ? "8f2a9c91d4e6b0c91d" : index === 1 ? "2b1180a484f3c0a48" : "b728f0e2a91d4f0e2") ? <CheckCircle2 size={16} className="text-[#318b5d] dark:text-[#5ac18a] shrink-0" /> : <Copy size={16} className="text-[#7a8a84] group-hover/hash:text-[#267e79] dark:group-hover/hash:text-[#3aa79f] shrink-0" />}
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[#667068] dark:text-[#7a8a84]">
        <span>Showing {filtered.length} of {ledgerRows.length} • scroll for more on mobile</span>
        <span className="hidden sm:inline">Tip: tap hash to copy full value</span>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-w-[760px] max-h-[84vh] overflow-hidden bg-white dark:bg-[#171c19] p-0 gap-0 border dark:border-[#2a352f]">
          <DialogHeader className="p-6 pb-4 border-b border-[#e6ebe4] dark:border-[#2a352f]">
            <DialogTitle className="font-sans text-[15px] font-semibold tracking-[-0.01em] flex items-center gap-2 dark:text-[#e8e9e3]">
              <FileText size={15} className="text-[#267e79] dark:text-[#3aa79f]" /> Full ledger — 10 entries
            </DialogTitle>
            <DialogDescription className="font-mono text-[12px] text-[#5a6a62] dark:text-[#9aa6a1]">Verified, append-only. Search and copy full hash. Export for audit.</DialogDescription>
          </DialogHeader>

          <div className="overflow-auto max-h-[54vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-[#f7f8f4] dark:bg-[#1c2220] z-10">
                <TableRow className="hover:bg-transparent border-b dark:border-[#2a352f]">
                  <TableHead className="font-sans text-[13px] dark:text-[#9aa6a1]">SEQ</TableHead>
                  <TableHead className="font-sans text-[13px] dark:text-[#9aa6a1]">Entry</TableHead>
                  <TableHead className="font-sans text-[13px] dark:text-[#9aa6a1]">Timestamp</TableHead>
                  <TableHead className="font-sans text-[13px] dark:text-[#9aa6a1]">Status</TableHead>
                  <TableHead className="font-sans text-[13px] dark:text-[#9aa6a1] text-right">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullLedgerSeed.map((row) => (
                  <TableRow key={row.sequence} className="hover:bg-[#f7f8f4]/60 dark:hover:bg-[#1c2220]/60 border-b dark:border-[#2a352f]">
                    <TableCell className="font-mono text-[13px] font-bold text-[#267e79] dark:text-[#3aa79f] py-3">{row.sequence}</TableCell>
                    <TableCell className="font-sans text-[14px] font-medium dark:text-[#e8e9e3] py-3">{row.event}</TableCell>
                    <TableCell className="font-mono text-[13px] text-muted-foreground dark:text-[#9aa6a1] py-3">2026-08-26 / {row.time}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border dark:border-[#2a352f] text-[13px] gap-1 rounded-full">
                        <BadgeCheck size={15} /> {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <button onClick={() => handleCopy(row.fullHash)} className="inline-flex items-center gap-2 rounded-full border border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#0e1210] px-3 py-1.5 hover:bg-white dark:hover:bg-[#1e2623] transition-colors">
                        <span className="font-mono text-[13px] tracking-[-0.01em] truncate max-w-[120px]">{row.hash.slice(0, 8)}…{row.hash.slice(-4)}</span>
                        {copied === row.fullHash ? <CheckCircle2 size={15} className="text-[#318b5d] dark:text-[#5ac18a] shrink-0" /> : <Copy size={15} className="text-[#667068] dark:text-[#7a8a84] shrink-0" />}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#1c2220] flex items-center justify-between gap-3">
            <div className="font-mono text-[11px] text-[#5a6a62] dark:text-[#9aa6a1]">{fullLedgerSeed.length} entries • verified • chain intact • dark & light ready</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFullOpen(false)} className="font-sans text-[14px] font-medium rounded-full px-5 h-8">
                Close
              </Button>
              <Button
                size="sm"
                className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[14px] font-medium rounded-full px-5 h-8 gap-1.5"
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
                <Download size={16} /> Export CSV
              </Button>
            </div>
          </div>
          {copied && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#172019] dark:bg-[#0e1210] text-white text-[13px] font-sans px-3.5 py-2 rounded-full flex items-center gap-2 shadow-lg border dark:border-[#2a352f]">
              <CheckCircle2 size={16} className="text-[#7ec8a1]" /> Copied {copied.slice(0, 8)}…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
