import { supabase } from './supabase'
import type { InspectionReport } from '../reportTypes'

type ReportRow = {
  report: InspectionReport
  updated_at: string
}

export const loadReports = async (): Promise<InspectionReport[]> => {
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('report')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as ReportRow[]).map((row) => row.report)
}

export const loadReportById = async (reportId: string): Promise<InspectionReport | null> => {
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('report, updated_at')
    .eq('report_id', reportId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return (data as ReportRow).report
}

export const upsertReport = async (report: InspectionReport): Promise<{ conflicted: boolean; latestReport: InspectionReport | null }> => {
  const { data: existing, error: readError } = await supabase
    .from('inspection_reports')
    .select('report, updated_at')
    .eq('report_id', report.reportId)
    .maybeSingle()

  if (readError) throw readError

  if (existing) {
    const existingUpdatedAt = new Date((existing as ReportRow).updated_at).getTime()
    const incomingUpdatedAt = new Date(report.updatedAt).getTime()

    if (existingUpdatedAt > incomingUpdatedAt) {
      return {
        conflicted: true,
        latestReport: (existing as ReportRow).report,
      }
    }
  }

  const { error } = await supabase.from('inspection_reports').upsert({
    id: report.id,
    report_id: report.reportId,
    status: report.status,
    report,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
  })

  if (error) throw error

  return {
    conflicted: false,
    latestReport: report,
  }
}
