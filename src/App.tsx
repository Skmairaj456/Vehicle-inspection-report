import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react'
import { generatePdfDocument } from './lib/reportPdf'
import { loadReportById, loadReports, upsertReport } from './lib/reportRepository'
import type {
  InspectionCondition,
  InspectionReport,
  InspectionSection,
  InspectionSectionMap,
  OtherItemEntry,
  RecommendationValue,
} from './reportTypes'
import { MAIN_SECTION_KEYS, OTHER_ITEMS, createEmptyReport } from './reportTypes'
import './App.css'

const CONDITION_OPTIONS: InspectionCondition[] = ['GOOD', 'ATTENTION REQUIRED', 'CRITICAL', 'NOT CHECKED']
const RECOMMENDATION_OPTIONS: RecommendationValue[] = [
  'NO ACTION',
  'MONITOR',
  'SERVICE RECOMMENDED',
  'IMMEDIATE ATTENTION',
]

const MAIN_SECTION_LABELS: Record<string, string> = {
  engine: 'ENGINE',
  transmission: 'TRANSMISSION',
  suspension: 'SUSPENSION',
  electricals: 'ELECTRICALS',
  interiors: 'INTERIORS',
  exteriors: 'EXTERIORS',
}

const compactText = (value: string | undefined) => (value?.trim() ? value.trim() : '—')

const validateReport = (report: InspectionReport) => {
  const missing: string[] = []

  if (!report.customer.name.trim()) missing.push('Customer Name')
  if (!report.customer.phone.trim()) missing.push('Phone Number')
  if (!report.vehicle.make.trim()) missing.push('Vehicle Make')
  if (!report.vehicle.model.trim()) missing.push('Vehicle Model')
  if (!report.vehicle.year.trim()) missing.push('Year')
  if (!report.inspection.date.trim()) missing.push('Inspection Date')

  return missing
}

const saveReport = async (report: InspectionReport, reports: InspectionReport[]): Promise<InspectionReport> => {
  const nextReport: InspectionReport = {
    ...report,
    updatedAt: new Date().toISOString(),
    status: 'COMPLETED',
  }

  const updated = [...reports]
  const index = updated.findIndex((item) => item.id === nextReport.id)
  if (index >= 0) updated[index] = nextReport
  else updated.unshift(nextReport)

  const result = await upsertReport(nextReport)
  if (result.conflicted && result.latestReport) {
    throw new Error(`This report was updated on another device. The latest version was reloaded.`)
  }

  return nextReport
}

const formatDate = (value: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
)

const ConditionSelector = ({ value, onChange }: { value: InspectionCondition; onChange: (value: InspectionCondition) => void }) => (
  <div className="condition-selector">
    {CONDITION_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        className={`condition-button ${value === option ? 'selected' : ''} ${option.toLowerCase().replace(/\s+/g, '-')}`}
        onClick={() => onChange(option)}
      >
        {option}
      </button>
    ))}
  </div>
)

const RecommendationSelector = ({ value, onChange }: { value: RecommendationValue; onChange: (value: RecommendationValue) => void }) => (
  <select value={value} onChange={(event) => onChange(event.target.value as RecommendationValue)}>
    {RECOMMENDATION_OPTIONS.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
)

const SectionEditor = ({
  label,
  section,
  onUpdate,
}: {
  label: string
  section: InspectionSection
  onUpdate: (field: keyof InspectionSection, value: string) => void
}) => (
  <div className="section-editor">
    <div className="section-header-line">
      <h3>{label}</h3>
      <span className={`mini-status ${section.condition === 'NOT CHECKED' ? 'not-checked' : 'checked'}`}>
        {section.condition === 'NOT CHECKED' ? 'Not checked' : '✓ Completed'}
      </span>
    </div>

    <div className="field-block">
      <label>Condition</label>
      <ConditionSelector value={section.condition} onChange={(nextValue) => onUpdate('condition', nextValue)} />
    </div>

    <div className="field-block">
      <label>Findings / Notes</label>
      <textarea value={section.findings} onChange={(event) => onUpdate('findings', event.target.value)} rows={3} />
    </div>

    <div className="field-block">
      <label>Recommendation</label>
      <RecommendationSelector value={section.recommendation} onChange={(nextValue) => onUpdate('recommendation', nextValue)} />
    </div>
  </div>
)

const OthersEditor = ({
  others,
  onToggle,
  onChange,
}: {
  others: OtherItemEntry[]
  onToggle: (item: string) => void
  onChange: (item: string, field: keyof OtherItemEntry, value: string) => void
}) => {
  const [expanded, setExpanded] = useState(true)
  const selected = new Set(others.map((entry) => entry.item))

  return (
    <div className="section-editor others-panel">
      <div className="section-header-line">
        <h3>OTHERS</h3>
        <button type="button" className="ghost-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {expanded ? (
        <>
          <div className="others-list">
            {OTHER_ITEMS.map((item) => (
              <label key={item} className="checkbox-row">
                <input type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)} />
                <span>{item}</span>
              </label>
            ))}
          </div>

          {others.length > 0 ? (
            <div className="others-items">
              {others.map((entry) => (
                <div key={entry.item} className="other-item-box">
                  <div className="other-item-title">{entry.item}</div>
                  <ConditionSelector value={entry.condition} onChange={(nextValue) => onChange(entry.item, 'condition', nextValue)} />
                  <textarea value={entry.findings} onChange={(event) => onChange(entry.item, 'findings', event.target.value)} rows={2} placeholder="Finding" />
                  <RecommendationSelector value={entry.recommendation} onChange={(nextValue) => onChange(entry.item, 'recommendation', nextValue)} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

const ReportPreview = ({ report }: { report: InspectionReport }) => (
  <div className="report-preview">
    <div className="preview-header-row">
      <div className="preview-brand-block">
        <img src="/dad-logo.png" alt="DEUTSCHE AUTO DEN logo" className="preview-logo" />
        <div>
          <div className="preview-brand">DEUTSCHE AUTO DEN</div>
          <div className="preview-tag">DAD MEETS YOUR CAR NEEDS</div>
        </div>
      </div>
      <div className="preview-paper-title">
        <div>FREE VEHICLE INSPECTION</div>
        <span>BY DAD</span>
      </div>
    </div>

    <div className="preview-grid-two">
      <div className="panel-block">
        <h4>CUSTOMER INFORMATION</h4>
        <p>Customer: {compactText(report.customer.name)}</p>
        <p>Phone: {compactText(report.customer.phone)}</p>
        <p>Email: {compactText(report.customer.email)}</p>
      </div>
      <div className="panel-block">
        <h4>VEHICLE INFORMATION</h4>
        <p>Make: {compactText(report.vehicle.make)}</p>
        <p>Model: {compactText(report.vehicle.model)}</p>
        <p>Year: {compactText(report.vehicle.year)}</p>
        <p>Registration: {compactText(report.vehicle.registrationNumber)}</p>
        <p>VIN: {compactText(report.vehicle.vin)}</p>
        <p>Odometer: {compactText(report.vehicle.odometer)}</p>
        <p>Inspection Date: {compactText(report.inspection.date)}</p>
        <p>Report ID: {compactText(report.reportId)}</p>
      </div>
    </div>

    <div className="panel-block preview-results-block">
      <h4>INSPECTION RESULTS</h4>
      {MAIN_SECTION_KEYS.map((key) => {
        const section = report.inspection.sections[key]
        return (
          <div key={key} className="preview-section-row">
            <strong>{MAIN_SECTION_LABELS[key]}</strong>
            <span>Condition: {section.condition}</span>
            <span>Finding: {compactText(section.findings)}</span>
            <span>Recommendation: {section.recommendation}</span>
          </div>
        )
      })}

      {report.inspection.sections.others.length > 0 ? (
        <div className="preview-section-row preview-others-row">
          <strong>OTHERS</strong>
          {report.inspection.sections.others.map((entry) => (
            <span key={entry.item}> {entry.item} — {entry.condition}</span>
          ))}
        </div>
      ) : null}
    </div>

    <div className="panel-block preview-overall-block">
      <h4>OVERALL CONDITION</h4>
      <p>Overall Condition: {compactText(report.inspection.overallCondition)}</p>
      <p>Technician Summary: {compactText(report.inspection.summary)}</p>
      <p>Key Recommendations: {compactText(report.inspection.keyRecommendations)}</p>
    </div>
  </div>
)

const Dashboard = ({ reports }: { reports: InspectionReport[] }) => (
  <div className="page-shell dashboard-shell">
    <div className="topbar topbar-centered">
      <div className="brand-block brand-center">
        <img src="/dad-logo.png" alt="DAD logo" className="brand-logo" />
        <div className="brand-text">DEUTSCHE AUTO DEN</div>
        <div className="brand-tag">DAD MEETS YOUR CAR NEEDS</div>
      </div>
    </div>

    <div className="dashboard-panel">
      <h1>VEHICLE INSPECTION REPORTS</h1>
      <div className="dashboard-actions">
        <Link to="/new-inspection" className="primary-btn dashboard-btn">+ NEW INSPECTION</Link>
        <Link to="/reports" className="secondary-btn dashboard-btn">VIEW REPORTS</Link>
      </div>
    </div>

    <div className="stats-grid">
      <div className="stat-box">
        <span>Total Reports</span>
        <strong>{reports.length}</strong>
      </div>
      <div className="stat-box">
        <span>Completed</span>
        <strong>{reports.filter((report) => report.status === 'COMPLETED').length}</strong>
      </div>
      <div className="stat-box">
        <span>Latest</span>
        <strong>{reports[0]?.reportId ?? '—'}</strong>
      </div>
    </div>
  </div>
)

const ReportsPage = ({ reports }: { reports: InspectionReport[] }) => {
  const [query, setQuery] = useState('')
  const filteredReports = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return reports

    return reports.filter((report) => {
      const source = [
        report.reportId,
        report.customer.name,
        report.customer.phone,
        `${report.vehicle.make} ${report.vehicle.model}`,
      ].join(' ').toLowerCase()
      return source.includes(term)
    })
  }, [query, reports])

  return (
    <div className="page-shell">
      <div className="topbar">
        <div className="brand-block">
          <img src="/dad-logo.png" alt="DAD logo" className="brand-logo" />
          <div>
            <div className="brand-text">DEUTSCHE AUTO DEN</div>
            <div className="brand-tag">DAD MEETS YOUR CAR NEEDS</div>
          </div>
        </div>
        <nav className="main-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/new-inspection">New Inspection</Link>
          <Link to="/reports">Reports</Link>
        </nav>
      </div>

      <div className="page-header-row list-header-row">
        <div>
          <p className="eyebrow">Previous inspections</p>
          <h1>Inspection Reports</h1>
        </div>
        <div className="search-wrap">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by Customer Name, Phone, Vehicle, or Report ID" />
        </div>
      </div>

      <div className="reports-grid">
        {filteredReports.length === 0 ? (
          <div className="empty-state">No inspection reports found.</div>
        ) : (
          filteredReports.map((report) => (
            <div key={report.id} className="report-card">
              <div className="report-card-head">
                <div>
                  <div className="report-id">{report.reportId}</div>
                  <div className="report-customer">{report.customer.name || 'Unnamed customer'}</div>
                </div>
                <StatusBadge status={report.status} />
              </div>

              <div className="report-meta-row"><span>Vehicle</span><strong>{report.vehicle.make} {report.vehicle.model}</strong></div>
              <div className="report-meta-row"><span>Inspection Date</span><strong>{formatDate(report.inspection.date)}</strong></div>
              <div className="report-meta-row"><span>Overall Condition</span><strong>{report.inspection.overallCondition}</strong></div>

              <div className="report-actions">
                <Link to={`/reports/${report.reportId}`} className="secondary-btn small-btn">VIEW</Link>
                <Link to={`/reports/${report.reportId}`} className="secondary-btn small-btn">EDIT</Link>
                <button type="button" className="primary-btn small-btn" onClick={() => void generatePdfDocument(report)}>PDF</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const InspectionFormPage = ({
  reports,
  setReports,
  initialReport,
  onSaved,
}: {
  reports: InspectionReport[]
  setReports: Dispatch<SetStateAction<InspectionReport[]>>
  initialReport: InspectionReport | null
  onSaved: (report: InspectionReport) => void
}) => {
  const navigate = useNavigate()
  const [report, setReport] = useState<InspectionReport>(initialReport ?? createEmptyReport(reports))
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setReport(initialReport ?? createEmptyReport(reports))
  }, [initialReport, reports])

  const updateMainSection = (sectionKey: keyof InspectionSectionMap, field: keyof InspectionSection, value: string) => {
    setReport((current) => ({
      ...current,
      inspection: {
        ...current.inspection,
        sections: {
          ...current.inspection.sections,
          [sectionKey]: {
            ...current.inspection.sections[sectionKey],
            [field]: value,
          },
        },
      },
      updatedAt: new Date().toISOString(),
    }))
  }

  const toggleOthersItem = (itemName: string) => {
    setReport((current) => {
      const list = [...current.inspection.sections.others]
      const match = list.find((entry) => entry.item === itemName)
      const nextList: OtherItemEntry[] = match
        ? list.filter((entry) => entry.item !== itemName)
        : [
            ...list,
            {
              item: itemName,
              condition: 'NOT CHECKED',
              findings: '',
              recommendation: 'NO ACTION',
            },
          ]

      return {
        ...current,
        inspection: {
          ...current.inspection,
          sections: {
            ...current.inspection.sections,
            others: nextList,
          },
        },
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const updateOtherItem = (itemName: string, field: keyof OtherItemEntry, value: string) => {
    const nextValue =
      field === 'condition'
        ? (value as InspectionCondition)
        : field === 'recommendation'
          ? (value as RecommendationValue)
          : value

    setReport((current) => ({
      ...current,
      inspection: {
        ...current.inspection,
        sections: {
          ...current.inspection.sections,
          others: current.inspection.sections.others.map((entry) =>
            entry.item === itemName ? { ...entry, [field]: nextValue } : entry,
          ),
        },
      },
      updatedAt: new Date().toISOString(),
    }))
  }

  const handleSave = async () => {
    const missing = validateReport(report)
    if (missing.length > 0) {
      setMessage(`Please complete the following required fields: ${missing.join(', ')}`)
      return
    }

    try {
      const nextReport = await saveReport(report, reports)
      setReports((current) => {
        const updated = [...current]
        const index = updated.findIndex((item) => item.id === nextReport.id)
        if (index >= 0) updated[index] = nextReport
        else updated.unshift(nextReport)
        return updated
      })
      onSaved(nextReport)
      setMessage(`REPORT SAVED\nReport ID: ${nextReport.reportId}`)
    } catch (error) {
      console.error('Failed to save report', error)

      if (error instanceof Error && error.message.includes('updated on another device')) {
        const latestReport = await loadReportById(report.reportId)
        if (latestReport) {
          setReport(latestReport)
          setReports((current) => {
            const updated = [...current]
            const index = updated.findIndex((item) => item.id === latestReport.id)
            if (index >= 0) updated[index] = latestReport
            else updated.unshift(latestReport)
            return updated
          })
          setMessage('This report was updated from another device. The latest version has been reloaded.')
          return
        }
      }

      setMessage('Could not save the report to Supabase. Check the database table and Row Level Security policies.')
    }
  }

  const handleGeneratePdf = async () => {
    const missing = validateReport(report)
    if (missing.length > 0) {
      setMessage(`Please complete the following required fields before PDF generation: ${missing.join(', ')}`)
      return
    }

    try {
      const nextReport = await saveReport(report, reports)
      setReports((current) => {
        const updated = [...current]
        const index = updated.findIndex((item) => item.id === nextReport.id)
        if (index >= 0) updated[index] = nextReport
        else updated.unshift(nextReport)
        return updated
      })
      onSaved(nextReport)
      await generatePdfDocument(nextReport)
      setMessage(`PDF generated for ${nextReport.reportId}`)
    } catch (error) {
      console.error('Failed to save report before PDF generation', error)

      if (error instanceof Error && error.message.includes('updated on another device')) {
        const latestReport = await loadReportById(report.reportId)
        if (latestReport) {
          setReport(latestReport)
          setReports((current) => {
            const updated = [...current]
            const index = updated.findIndex((item) => item.id === latestReport.id)
            if (index >= 0) updated[index] = latestReport
            else updated.unshift(latestReport)
            return updated
          })
          setMessage('This report was updated from another device. The latest version has been reloaded before PDF generation.')
          return
        }
      }

      setMessage('Could not save the report to Supabase, so the PDF was not generated.')
    }
  }

  const mainStatusCount = MAIN_SECTION_KEYS.filter((key) => report.inspection.sections[key].condition !== 'NOT CHECKED').length

  return (
    <div className="page-shell">
      <div className="topbar">
        <div className="brand-block">
          <img src="/dad-logo.png" alt="DAD logo" className="brand-logo" />
          <div>
            <div className="brand-text">DEUTSCHE AUTO DEN</div>
            <div className="brand-tag">DAD MEETS YOUR CAR NEEDS</div>
          </div>
        </div>
        <nav className="main-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/new-inspection">New Inspection</Link>
          <Link to="/reports">Reports</Link>
        </nav>
      </div>

      <div className="page-header-row">
        <div>
          <p className="eyebrow">Inspection report</p>
          <h1>FREE VEHICLE INSPECTION</h1>
        </div>
        <div className="header-status-box">
          <span className="muted-label">Status</span>
          <StatusBadge status={report.status} />
          <span className="muted-label">Sections complete</span>
          <strong>{mainStatusCount}/6</strong>
        </div>
      </div>

      {message ? <div className="notice-box">{message}</div> : null}

      <div className="inspection-grid">
        <main className="inspection-main">
          <section className="card-form">
            <h2>Customer Information</h2>
            <div className="field-grid two-col">
              <label>
                <span>Customer Name</span>
                <input value={report.customer.name} onChange={(event) => setReport((current) => ({ ...current, customer: { ...current.customer, name: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Phone Number</span>
                <input value={report.customer.phone} onChange={(event) => setReport((current) => ({ ...current, customer: { ...current.customer, phone: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label className="full-span">
                <span>Email</span>
                <input value={report.customer.email} onChange={(event) => setReport((current) => ({ ...current, customer: { ...current.customer, email: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
            </div>
          </section>

          <section className="card-form">
            <h2>Vehicle Information</h2>
            <div className="field-grid four-col">
              <label>
                <span>Vehicle Make</span>
                <input value={report.vehicle.make} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, make: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Vehicle Model</span>
                <input value={report.vehicle.model} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, model: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Year</span>
                <input value={report.vehicle.year} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, year: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Registration Number</span>
                <input value={report.vehicle.registrationNumber} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, registrationNumber: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>VIN / Chassis Number</span>
                <input value={report.vehicle.vin} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, vin: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Odometer Reading</span>
                <input value={report.vehicle.odometer} onChange={(event) => setReport((current) => ({ ...current, vehicle: { ...current.vehicle, odometer: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Inspection Date</span>
                <input type="date" value={report.inspection.date} onChange={(event) => setReport((current) => ({ ...current, inspection: { ...current.inspection, date: event.target.value }, updatedAt: new Date().toISOString() }))} />
              </label>
              <label>
                <span>Report ID</span>
                <input value={report.reportId} readOnly />
              </label>
            </div>
          </section>

          <section className="card-form">
            <h2>Inspection Areas</h2>
            <div className="section-stack">
              {MAIN_SECTION_KEYS.map((key) => (
                <SectionEditor key={key} label={MAIN_SECTION_LABELS[key]} section={report.inspection.sections[key]} onUpdate={(field, value) => updateMainSection(key, field, value)} />
              ))}

              <OthersEditor others={report.inspection.sections.others} onToggle={toggleOthersItem} onChange={updateOtherItem} />
            </div>
          </section>

          <section className="card-form">
            <h2>Overall Assessment</h2>
            <div className="field-grid condition-grid overall-grid">
              {CONDITION_OPTIONS.filter((option) => option !== 'NOT CHECKED').map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`condition-button ${report.inspection.overallCondition === option ? 'selected' : ''} ${option.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => setReport((current) => ({ ...current, inspection: { ...current.inspection, overallCondition: option } }))}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="field-grid">
              <label className="full-span">
                <span>Technician Summary</span>
                <textarea value={report.inspection.summary} onChange={(event) => setReport((current) => ({ ...current, inspection: { ...current.inspection, summary: event.target.value } }))} rows={4} />
              </label>
              <label className="full-span">
                <span>Key Recommendations</span>
                <textarea value={report.inspection.keyRecommendations} onChange={(event) => setReport((current) => ({ ...current, inspection: { ...current.inspection, keyRecommendations: event.target.value } }))} rows={4} />
              </label>
            </div>
          </section>

          <div className="preview-panel">
            <div className="preview-actions-title">
              <h3>PREVIEW REPORT</h3>
              <button type="button" className="primary-btn" onClick={handleSave}>SAVE REPORT</button>
            </div>

            <ReportPreview report={report} />

            <div className="action-row">
              <button type="button" className="secondary-btn" onClick={() => navigate(`/reports/${report.reportId}`)}>EDIT REPORT</button>
              <button type="button" className="primary-btn" onClick={handleSave}>SAVE REPORT</button>
              <button type="button" className="primary-btn accent" onClick={() => void handleGeneratePdf()}>GENERATE PDF</button>
            </div>
          </div>
        </main>

        <aside className="summary-panel">
          <div className="card-form summary-card">
            <h3>Inspection Summary</h3>
            <div className="detail-list">
              <div><span>Customer</span><strong>{compactText(report.customer.name)}</strong></div>
              <div><span>Vehicle</span><strong>{compactText(report.vehicle.make)} {compactText(report.vehicle.model)}</strong></div>
              <div><span>Inspection Date</span><strong>{formatDate(report.inspection.date)}</strong></div>
              <div><span>Report ID</span><strong>{report.reportId}</strong></div>
              <div><span>Overall</span><strong>{report.inspection.overallCondition}</strong></div>
            </div>
          </div>

          <div className="card-form summary-card">
            <h3>Quick Status</h3>
            <ul className="quick-list">
              {MAIN_SECTION_KEYS.map((key) => (
                <li key={key}><span>{MAIN_SECTION_LABELS[key]}</span><strong>{report.inspection.sections[key].condition}</strong></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

const ReportDetailPage = ({
  reports,
  setReports,
}: {
  reports: InspectionReport[]
  setReports: Dispatch<SetStateAction<InspectionReport[]>>
}) => {
  const { id } = useParams()
  const navigate = useNavigate()
  const report = reports.find((item) => item.reportId === id)

  if (!report) return <Navigate to="/reports" replace />

  return (
    <InspectionFormPage
      reports={reports}
      setReports={setReports}
      initialReport={report}
      onSaved={(saved) => {
        setReports((current) => {
          const next = [...current]
          const index = next.findIndex((item) => item.id === saved.id)
          if (index >= 0) next[index] = saved
          else next.unshift(saved)
          return next
        })
        navigate(`/reports/${saved.reportId}`)
      }}
    />
  )
}

const AppRoutes = () => {
  const [reports, setReports] = useState<InspectionReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    loadReports()
      .then((loadedReports) => {
        if (active) setReports(loadedReports)
      })
      .catch((error) => {
        console.error('Failed to load reports from Supabase', error)
        if (active) setLoadError('Could not connect to Supabase. Run supabase/schema.sql and check your .env.local values.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (isLoading) {
    return <div className="page-shell empty-state">Loading inspection reports...</div>
  }

  if (loadError) {
    return <div className="page-shell empty-state">{loadError}</div>
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard reports={reports} />} />
      <Route
        path="/new-inspection"
        element={
          <InspectionFormPage
            reports={reports}
            setReports={setReports}
            initialReport={createEmptyReport(reports)}
            onSaved={(saved) => {
              setReports((current) => {
                const next = [...current]
                const index = next.findIndex((item) => item.id === saved.id)
                if (index >= 0) next[index] = saved
                else next.unshift(saved)
                return next
              })
            }}
          />
        }
      />
      <Route path="/reports" element={<ReportsPage reports={reports} />} />
      <Route path="/reports/:id" element={<ReportDetailPage reports={reports} setReports={setReports} />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
