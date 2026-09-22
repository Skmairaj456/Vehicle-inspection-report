import { supabase } from './supabase'
import type { InspectionReport } from '../reportTypes'

type ReportRow = {
  report: InspectionReport
}

export const loadReports = async (): Promise<InspectionReport[]> => {
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('report')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as ReportRow[]).map((row) => row.report)
}

export const upsertReport = async (report: InspectionReport): Promise<void> => {
  const { error } = await supabase.from('inspection_reports').upsert({
    id: report.id,
    report_id: report.reportId,
    status: report.status,
    report,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
  })

  if (error) throw error
}
