import { useCallback } from "react";
import { useColdChain } from "@/context/ColdChainContext";
import { buildShipmentReport, reportFilename } from "@/lib/report";
import { renderShipmentReportPdf } from "@/lib/reportPdf";
import { downloadPdf } from "@/lib/pdf";

/**
 * Produces the end-of-shipment report as a PDF download.
 *
 * The report is built from live state at the moment it is asked for, never
 * cached: a stored copy would be a second account of the shipment sitting
 * beside the ledger, and the two would disagree the first time an entry was
 * appended after the cache was written.
 */
export function useReportExport(): () => void {
  const { ledger, fieldLogMeta, chainVerification, discardedEntryCount } = useColdChain();

  return useCallback(() => {
    const generatedAt = new Date();
    const report = buildShipmentReport({
      ledger,
      shipment: fieldLogMeta,
      verification: chainVerification,
      discardedEntryCount,
      generatedAt,
    });
    downloadPdf(reportFilename(fieldLogMeta, generatedAt), renderShipmentReportPdf(report));
  }, [ledger, fieldLogMeta, chainVerification, discardedEntryCount]);
}
