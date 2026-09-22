export const MAIN_SECTION_KEYS = [
  'engine',
  'transmission',
  'suspension',
  'electricals',
  'interiors',
  'exteriors',
] as const

export const OTHER_ITEMS = [
  'BRAKE PADS',
  'BRAKE DISCS / ROTORS',
  'BRAKE FLUID',
  'ENGINE OIL',
  'TRANSMISSION FLUID',
  'COOLANT',
  'POWER STEERING FLUID',
  'WINDSHIELD WASHER FLUID',
  'TYRES',
  'WHEEL ALIGNMENT',
  'BATTERY',
  'AIR CONDITIONING',
  'COOLING SYSTEM',
  'RADIATOR',
  'LIGHTING',
  'WINDSHIELD / GLASS',
  'WIPERS',
  'BELTS',
  'HOSES',
  'EXHAUST',
  'UNDERBODY',
  'BODY / PAINT',
  'OTHER',
] as const

export type InspectionCondition = 'GOOD' | 'ATTENTION REQUIRED' | 'CRITICAL' | 'NOT CHECKED'
export type RecommendationValue =
  | 'NO ACTION'
  | 'MONITOR'
  | 'SERVICE RECOMMENDED'
  | 'IMMEDIATE ATTENTION'

export type InspectionSection = {
  condition: InspectionCondition
  findings: string
  recommendation: RecommendationValue
}

export type OtherItemEntry = {
  item: string
  condition: InspectionCondition
  findings: string
  recommendation: RecommendationValue
}

export type InspectionSectionMap = {
  engine: InspectionSection
  transmission: InspectionSection
  suspension: InspectionSection
  electricals: InspectionSection
  interiors: InspectionSection
  exteriors: InspectionSection
  others: OtherItemEntry[]
}

export type CustomerInfo = {
  name: string
  phone: string
  email: string
}

export type VehicleInfo = {
  make: string
  model: string
  year: string
  registrationNumber: string
  vin: string
  odometer: string
}

export type ReportStatus = 'DRAFT' | 'COMPLETED'

export type InspectionReport = {
  id: string
  reportId: string
  customer: CustomerInfo
  vehicle: VehicleInfo
  inspection: {
    date: string
    sections: InspectionSectionMap
    overallCondition: Exclude<InspectionCondition, 'NOT CHECKED'>
    summary: string
    keyRecommendations: string
  }
  status: ReportStatus
  createdAt: string
  updatedAt: string
}

export const createDefaultSection = (): InspectionSection => ({
  condition: 'NOT CHECKED',
  findings: '',
  recommendation: 'NO ACTION',
})

export const createDefaultOthers = (): OtherItemEntry[] => []

export const createDefaultSections = (): InspectionSectionMap => ({
  engine: createDefaultSection(),
  transmission: createDefaultSection(),
  suspension: createDefaultSection(),
  electricals: createDefaultSection(),
  interiors: createDefaultSection(),
  exteriors: createDefaultSection(),
  others: createDefaultOthers(),
})

export const createEmptyReport = (existingReports: InspectionReport[] = []): InspectionReport => {
  const year = new Date().getFullYear()
  const prefix = `DAD-INS-${year}-`
  const nextId = existingReports.reduce((max, report) => {
    const match = report.reportId.match(/DAD-INS-(\d{4})-(\d{4})/)
    if (!match) return max
    const current = Number.parseInt(match[2], 10)
    return Number.isFinite(current) ? Math.max(max, current) : max
  }, 0)

  const now = new Date().toISOString()
  const reportId = `${prefix}${String(nextId + 1).padStart(4, '0')}`

  return {
    id: crypto.randomUUID(),
    reportId,
    customer: {
      name: '',
      phone: '',
      email: '',
    },
    vehicle: {
      make: '',
      model: '',
      year: '',
      registrationNumber: '',
      vin: '',
      odometer: '',
    },
    inspection: {
      date: new Date().toISOString().slice(0, 10),
      sections: createDefaultSections(),
      overallCondition: 'GOOD',
      summary: '',
      keyRecommendations: '',
    },
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }
}
