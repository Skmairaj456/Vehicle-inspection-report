import jsPDF from 'jspdf'
import type { InspectionCondition, InspectionReport, InspectionSection, OtherItemEntry, RecommendationValue } from '../reportTypes'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 34
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const RED = { r: 177, g: 29, b: 29 }
const INK = { r: 27, g: 28, b: 29 }
const MUTED = { r: 103, g: 105, b: 107 }
const LINE = { r: 218, g: 219, b: 219 }
const PAPER = { r: 250, g: 249, b: 246 }

type RGB = { r: number; g: number; b: number }

const cleanText = (value: string | undefined) => (value?.trim() ? value.trim() : '—')

const truncate = (value: string | undefined, maxLength: number) => {
  const clean = cleanText(value)
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trimEnd()}...` : clean
}

const wrappedText = (doc: jsPDF, value: string | undefined, width: number, maxLines = 2) => {
  const lines = doc.splitTextToSize(cleanText(value), width) as string[]
  if (lines.length <= maxLines) return lines
  const visible = lines.slice(0, maxLines)
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[. ]+$/, '')}...`
  return visible
}

const fitWrappedBlock = (
  doc: jsPDF,
  value: string | undefined,
  width: number,
  maxLines: number,
  minFontSize: number,
  maxFontSize: number,
) => {
  const source = cleanText(value)
  let fontSize = maxFontSize
  let lines = doc.splitTextToSize(source, width) as string[]

  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 0.4
    doc.setFontSize(fontSize)
    lines = doc.splitTextToSize(source, width) as string[]
  }

  return {
    lines: lines.slice(0, maxLines),
    fontSize,
  }
}

const formatDate = (value: string) => {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
}

const setText = (doc: jsPDF, color: RGB) => doc.setTextColor(color.r, color.g, color.b)
const setFill = (doc: jsPDF, color: RGB) => doc.setFillColor(color.r, color.g, color.b)
const setDraw = (doc: jsPDF, color: RGB) => doc.setDrawColor(color.r, color.g, color.b)

const roundedRect = (doc: jsPDF, x: number, y: number, width: number, height: number, fill: RGB, stroke = LINE, radius = 5) => {
  setFill(doc, fill)
  setDraw(doc, stroke)
  doc.setLineWidth(0.65)
  doc.roundedRect(x, y, width, height, radius, radius, 'FD')
}

const loadLogo = async () => {
  try {
    const response = await fetch('/dad-logo.png')
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const conditionStyle = (condition: InspectionCondition): { fill: RGB; text: RGB; border: RGB } => {
  if (condition === 'GOOD') return { fill: { r: 235, g: 244, b: 237 }, text: { r: 42, g: 112, b: 64 }, border: { r: 159, g: 198, b: 169 } }
  if (condition === 'ATTENTION REQUIRED') return { fill: { r: 252, g: 244, b: 228 }, text: { r: 143, g: 83, b: 15 }, border: { r: 225, g: 184, b: 111 } }
  if (condition === 'CRITICAL') return { fill: { r: 250, g: 232, b: 232 }, text: RED, border: { r: 211, g: 137, b: 137 } }
  return { fill: { r: 239, g: 240, b: 240 }, text: MUTED, border: { r: 194, g: 196, b: 197 } }
}

const shortRecommendation = (recommendation: RecommendationValue) => {
  if (recommendation === 'IMMEDIATE ATTENTION') return 'IMMEDIATE ATT.'
  if (recommendation === 'SERVICE RECOMMENDED') return 'SERVICE RECOMMENDED'
  return recommendation
}

const drawConditionBadge = (doc: jsPDF, condition: InspectionCondition, x: number, y: number, width: number, height = 15) => {
  const style = conditionStyle(condition)
  setFill(doc, style.fill)
  setDraw(doc, style.border)
  doc.setLineWidth(0.6)
  doc.roundedRect(x, y, width, height, 3.5, 3.5, 'FD')
  setText(doc, style.text)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(condition, x + width / 2, y + 10.2, { align: 'center' })
}

const drawPanelTitle = (doc: jsPDF, title: string, x: number, y: number) => {
  setText(doc, RED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(title, x, y)
}

const drawInfoPanel = (doc: jsPDF, title: string, rows: Array<[string, string]>, x: number, y: number, width: number, height: number) => {
  roundedRect(doc, x, y, width, height, { r: 255, g: 255, b: 255 })
  drawPanelTitle(doc, title, x + 12, y + 16)
  setDraw(doc, LINE)
  doc.setLineWidth(0.6)
  doc.line(x + 12, y + 23, x + width - 12, y + 23)

  const rowHeight = 15
  rows.forEach(([label, value], index) => {
    const rowY = y + 36 + index * rowHeight
    setText(doc, MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.1)
    doc.text(label, x + 12, rowY)
    setText(doc, INK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.4)
    doc.text(truncate(value, title === 'CUSTOMER INFORMATION' ? 35 : 27), x + 82, rowY)
  })
}

const drawMetaRow = (doc: jsPDF, report: InspectionReport, y: number) => {
  setFill(doc, { r: 244, g: 242, b: 238 })
  doc.rect(MARGIN, y, CONTENT_WIDTH, 25, 'F')
  setText(doc, MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('REPORT ID', MARGIN + 12, y + 10)
  doc.text('INSPECTION DATE', MARGIN + 302, y + 10)
  setText(doc, INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(report.reportId, MARGIN + 12, y + 19)
  doc.text(formatDate(report.inspection.date), MARGIN + 302, y + 19)
}

const drawResultsTable = (doc: jsPDF, report: InspectionReport, y: number) => {
  const columns = [
    { label: 'CATEGORY', width: 101 },
    { label: 'CONDITION', width: 108 },
    { label: 'FINDING', width: 181 },
    { label: 'RECOMMENDATION', width: CONTENT_WIDTH - 101 - 108 - 181 },
  ]
  const headerHeight = 22
  const rowHeight = 35
  const tableHeight = headerHeight + rowHeight * 6

  roundedRect(doc, MARGIN, y, CONTENT_WIDTH, tableHeight, { r: 255, g: 255, b: 255 }, LINE, 4)
  setFill(doc, { r: 34, g: 35, b: 36 })
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, headerHeight, 4, 4, 'F')
  doc.rect(MARGIN, y + headerHeight - 4, CONTENT_WIDTH, 4, 'F')

  let columnX = MARGIN
  columns.forEach((column, index) => {
    if (index > 0) {
      setDraw(doc, { r: 93, g: 94, b: 95 })
      doc.setLineWidth(0.5)
      doc.line(columnX, y, columnX, y + tableHeight)
    }
    setText(doc, { r: 255, g: 255, b: 255 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.4)
    doc.text(column.label, columnX + 8, y + 14)
    columnX += column.width
  })

  const sections: Array<[string, InspectionSection]> = [
    ['ENGINE', report.inspection.sections.engine],
    ['TRANSMISSION', report.inspection.sections.transmission],
    ['SUSPENSION', report.inspection.sections.suspension],
    ['ELECTRICALS', report.inspection.sections.electricals],
    ['INTERIORS', report.inspection.sections.interiors],
    ['EXTERIORS', report.inspection.sections.exteriors],
  ]

  sections.forEach(([name, section], index) => {
    const rowY = y + headerHeight + index * rowHeight
    if (index > 0) {
      setDraw(doc, LINE)
      doc.setLineWidth(0.55)
      doc.line(MARGIN, rowY, MARGIN + CONTENT_WIDTH, rowY)
    }

    const baseline = rowY + 15
    setText(doc, INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.4)
    doc.text(name, MARGIN + 8, baseline)
    drawConditionBadge(doc, section.condition, MARGIN + columns[0].width + 7, rowY + 10, columns[1].width - 14)

    setText(doc, INK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.text(wrappedText(doc, section.findings, columns[2].width - 16, 2), MARGIN + columns[0].width + columns[1].width + 8, rowY + 13)

    setText(doc, MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.7)
    doc.text(shortRecommendation(section.recommendation), MARGIN + columns[0].width + columns[1].width + columns[2].width + 8, baseline)
  })

  return y + tableHeight
}

const drawOthersTable = (doc: jsPDF, items: OtherItemEntry[], y: number, title: string) => {
  const headerHeight = 22
  const rowHeight = 42
  const height = headerHeight + Math.max(items.length, 1) * rowHeight
  roundedRect(doc, MARGIN, y, CONTENT_WIDTH, height, { r: 255, g: 255, b: 255 }, LINE, 4)
  setFill(doc, { r: 34, g: 35, b: 36 })
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, headerHeight, 4, 4, 'F')
  doc.rect(MARGIN, y + headerHeight - 4, CONTENT_WIDTH, 4, 'F')

  const columns = [
    { label: 'ITEM', width: 112 },
    { label: 'CONDITION', width: 112 },
    { label: 'FINDING', width: 190 },
    { label: 'RECOMMENDATION', width: CONTENT_WIDTH - 112 - 112 - 190 },
  ]
  let columnX = MARGIN
  columns.forEach((column, index) => {
    if (index > 0) {
      setDraw(doc, { r: 93, g: 94, b: 95 })
      doc.setLineWidth(0.5)
      doc.line(columnX, y, columnX, y + height)
    }
    setText(doc, { r: 255, g: 255, b: 255 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.4)
    doc.text(index === 0 ? title : column.label, columnX + 8, y + 14)
    columnX += column.width
  })

  if (items.length === 0) {
    setText(doc, MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.text('No additional items selected', MARGIN + 8, y + headerHeight + 16)
    return y + height
  }

  items.forEach((item, index) => {
    const rowY = y + headerHeight + index * rowHeight
    if (index > 0) {
      setDraw(doc, LINE)
      doc.setLineWidth(0.55)
      doc.line(MARGIN, rowY, MARGIN + CONTENT_WIDTH, rowY)
    }

    setText(doc, INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.1)
    doc.text(wrappedText(doc, item.item, columns[0].width - 16, 2), MARGIN + 8, rowY + 15)
    drawConditionBadge(doc, item.condition, MARGIN + columns[0].width + 7, rowY + 11, columns[1].width - 14)
    setText(doc, INK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.1)
    doc.text(wrappedText(doc, item.findings, columns[2].width - 16, 2), MARGIN + columns[0].width + columns[1].width + 8, rowY + 14)
    setText(doc, MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(wrappedText(doc, item.recommendation, columns[3].width - 16, 2), MARGIN + columns[0].width + columns[1].width + columns[2].width + 8, rowY + 14)
  })

  return y + height
}

const drawFooter = (doc: jsPDF, report?: InspectionReport) => {
  const footerY = PAGE_HEIGHT - 34
  setDraw(doc, RED)
  doc.setLineWidth(1.2)
  doc.line(MARGIN, footerY, PAGE_WIDTH - MARGIN, footerY)
  setText(doc, INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('DEUTSCHE AUTO DEN', MARGIN, footerY + 17)
  setText(doc, MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.text('DAD MEETS YOUR CAR NEEDS', MARGIN, footerY + 28)
  if (report) {
    doc.text(`Report ID: ${report.reportId}`, PAGE_WIDTH - MARGIN, footerY + 17, { align: 'right' })
    doc.text(`Inspection Date: ${formatDate(report.inspection.date)}`, PAGE_WIDTH - MARGIN, footerY + 28, { align: 'right' })
  } else {
    doc.text(`Page ${doc.getNumberOfPages()}`, PAGE_WIDTH - MARGIN, footerY + 28, { align: 'right' })
  }
}

const drawContinuationHeader = (doc: jsPDF) => {
  setFill(doc, PAPER)
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F')
  setFill(doc, { r: 28, g: 29, b: 30 })
  doc.rect(0, 0, PAGE_WIDTH, 42, 'F')
  setDraw(doc, RED)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, 42, PAGE_WIDTH - MARGIN, 42)
  setText(doc, { r: 255, g: 255, b: 255 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('DEUTSCHE AUTO DEN', MARGIN, 25)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('VEHICLE INSPECTION REPORT - CONTINUED', PAGE_WIDTH - MARGIN, 25, { align: 'right' })
}

const drawOthers = (doc: jsPDF, items: OtherItemEntry[], y: number) => {
  if (items.length === 0) {
    return drawOthersTable(doc, [], y, 'OTHERS')
  }

  const pageSize = 6
  let currentY = y
  let pageItems = items.slice(0, pageSize)
  let remaining = items.slice(pageSize)
  let continuation = false

  while (pageItems.length > 0) {
    currentY = drawOthersTable(doc, pageItems, currentY, continuation ? 'OTHERS - CONTINUED' : 'OTHERS')
    if (remaining.length === 0) break

    drawFooter(doc)
    doc.addPage()
    drawContinuationHeader(doc)
    currentY = 62
    pageItems = remaining.slice(0, pageSize)
    remaining = remaining.slice(pageSize)
    continuation = true
  }

  return currentY
}

const drawAssessment = (doc: jsPDF, report: InspectionReport, y: number) => {
  const height = 118
  roundedRect(doc, MARGIN, y, CONTENT_WIDTH, height, { r: 255, g: 255, b: 255 }, LINE, 4)
  setFill(doc, { r: 34, g: 35, b: 36 })
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 23, 4, 4, 'F')
  doc.rect(MARGIN, y + 19, CONTENT_WIDTH, 4, 'F')
  setText(doc, { r: 255, g: 255, b: 255 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('OVERALL ASSESSMENT', MARGIN + 12, y + 15)

  setText(doc, MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.text('OVERALL CONDITION', MARGIN + 13, y + 39)
  drawConditionBadge(doc, report.inspection.overallCondition, MARGIN + 102, y + 29, 94)

  setText(doc, RED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.4)
  doc.text('TECHNICIAN SUMMARY', MARGIN + 222, y + 39)
  setText(doc, INK)
  doc.setFont('helvetica', 'normal')
  const summaryBlock = fitWrappedBlock(doc, report.inspection.summary, 170, 3, 6.8, 8.4)
  doc.text(summaryBlock.lines, MARGIN + 222, y + 52)

  setText(doc, RED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.4)
  doc.text('KEY RECOMMENDATIONS', MARGIN + 13, y + 70)
  setText(doc, INK)
  doc.setFont('helvetica', 'normal')
  const recommendationBlock = fitWrappedBlock(doc, report.inspection.keyRecommendations, 210, 3, 6.8, 8.6)
  doc.text(recommendationBlock.lines, MARGIN + 125, y + 70)

  return y + height
}

export const generatePdfDocument = async (report: InspectionReport) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const logoDataUrl = await loadLogo()
  setFill(doc, PAPER)
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F')

  const headerHeight = 70
  setFill(doc, { r: 28, g: 29, b: 30 })
  doc.rect(0, 0, PAGE_WIDTH, headerHeight, 'F')
  setDraw(doc, RED)
  doc.setLineWidth(2)
  doc.line(MARGIN, headerHeight, PAGE_WIDTH - MARGIN, headerHeight)

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 16, 34, 34)
    } catch {
      // The text branding remains complete if the optional image cannot be embedded.
    }
  }

  setText(doc, { r: 255, g: 255, b: 255 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('DEUTSCHE AUTO DEN', MARGIN + 46, 29)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.text('DAD MEETS YOUR CAR NEEDS', MARGIN + 46, 42)

  setText(doc, { r: 226, g: 74, b: 67 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('FREE VEHICLE INSPECTION', PAGE_WIDTH - MARGIN, 29, { align: 'right' })
  setText(doc, { r: 255, g: 255, b: 255 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.text('BY DAD', PAGE_WIDTH - MARGIN, 42, { align: 'right' })

  const panelY = 84
  const panelGap = 12
  const panelWidth = (CONTENT_WIDTH - panelGap) / 2
  drawInfoPanel(doc, 'CUSTOMER INFORMATION', [
    ['Customer', report.customer.name],
    ['Phone', report.customer.phone],
    ['Email', report.customer.email],
  ], MARGIN, panelY, panelWidth, 71)
  drawInfoPanel(doc, 'VEHICLE INFORMATION', [
    ['Make', report.vehicle.make],
    ['Model', report.vehicle.model],
    ['Year', report.vehicle.year],
    ['Registration', report.vehicle.registrationNumber],
    ['VIN', report.vehicle.vin],
    ['Odometer', report.vehicle.odometer],
  ], MARGIN + panelWidth + panelGap, panelY, panelWidth, 116)

  drawMetaRow(doc, report, 205)

  drawPanelTitle(doc, 'INSPECTION RESULTS', MARGIN, 253)
  setText(doc, MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.text('Structured findings across the six primary inspection categories', MARGIN, 264)
  const resultsBottom = drawResultsTable(doc, report, 273)

  const othersBottom = drawOthers(doc, report.inspection.sections.others, resultsBottom + 11)
  const assessmentHeight = 91
  const footerTop = PAGE_HEIGHT - 34
  let assessmentY = othersBottom + 11
  if (assessmentY + assessmentHeight > footerTop - 12) {
    drawFooter(doc)
    doc.addPage()
    drawContinuationHeader(doc)
    assessmentY = 62
  }
  drawAssessment(doc, report, assessmentY)

  drawFooter(doc, report)

  doc.save(`${report.reportId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.pdf`)
}
