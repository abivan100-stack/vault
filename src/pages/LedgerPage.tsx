import { useEffect } from "react";
import anime from "animejs";
import { useColdChain } from "../context/ColdChainContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function LedgerPage() {
  const { ledgerRows } = useColdChain();

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

  return (
    <section className="ledger-section" id="ledger">
      <div className="section-heading ledger-heading">
        <div>
          <div className="eyebrow">02 / IMMUTABLE TRAIL</div>
          <h2>Every reading leaves a mark.</h2>
        </div>
        <a className="text-link" href="#ledger">
          OPEN FULL LEDGER <span aria-hidden="true">&gt;</span>
        </a>
      </div>

      {/* shadcn Table with vault styling preserved */}
      <div className="rounded-lg border border-[#9ea99e] bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-[#f7f8f4]">
            <TableRow className="border-b border-[#cbd2c6] hover:bg-transparent">
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">SEQ</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">ENTRY TYPE</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">UTC TIMESTAMP</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">STATUS</TableHead>
              <TableHead className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">HASH</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerRows.map((row, index) => (
              <TableRow key={row.sequence} className="border-b border-[#cbd2c6] hover:bg-[#f7f8f4]/50">
                <TableCell className="font-mono text-[9px] text-[#267e79] font-semibold">{row.sequence}</TableCell>
                <TableCell className="font-mono text-[10px]">{row.event}</TableCell>
                <TableCell className="font-mono text-[9px] text-muted-foreground">2026-08-26 / {row.time}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-[#e6f0e9] text-[#318b5d] border-[#cbd2c6] font-mono text-[9px] gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#318b5d]" />
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-[9px] text-muted-foreground">{index === 0 ? "8f2a...c91d" : index === 1 ? "2b11...0a48" : "b728...f0e2"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Fallback grid for reference - hidden, keeps vault aesthetic if needed */}
      <div className="sr-only ledger-table" role="table" aria-label="Recent ledger entries">
        <div className="ledger-row ledger-header" role="row">
          <span>SEQ</span>
          <span>ENTRY TYPE</span>
          <span>UTC TIMESTAMP</span>
          <span>STATUS</span>
          <span>HASH</span>
        </div>
      </div>
    </section>
  );
}
