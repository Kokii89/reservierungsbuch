"use client";
import dynamic from "next/dynamic";

// nur im Client rendern (verhindert Hydration-Diffs)
const TableOverview = dynamic(() => import("@/components/TableOverview"), {
  ssr: false,
});

export default function TableOverviewClient() {
  return <TableOverview />;
}