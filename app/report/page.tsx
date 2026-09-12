import type { Metadata } from 'next';
import { CompetitionReport } from './report-client';

export const metadata: Metadata = {
  title: 'Competition evidence — Mimo',
  robots: { index: false, follow: false },
};

export default function ReportPage() {
  return <CompetitionReport />;
}
