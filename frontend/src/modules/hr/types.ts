export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type AppraisalCycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type AppraisalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type AppraisalRelationType = 'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE';
export type AppraisalReviewStatus = 'PENDING' | 'SUBMITTED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'INTERN' | 'CONTRACT' | 'COMMUNITY';
export type EmployeeGrade = 'ENTRY' | 'JUNIOR' | 'SENIOR' | 'MANAGEMENT';

export interface Employee {
  id: string;
  organizationId: string;
  userId: string;
  employeeNumber: string;
  jobTitle: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  employmentType: EmploymentType | null;
  grade: EmployeeGrade | null;
  branch: string | null;
  exitDate: string | null;
  shiftId: string | null;
  manager?: Employee | null;
  directReports?: Employee[];
  shift?: Shift | null;
}

export interface DashboardBucket {
  label: string;
  count: number;
}

export interface HrDashboard {
  totalEmployees: number;
  newHiresThisYear: number;
  exitsThisYear: number;
  relievingThisQuarter: number;
  joiningThisQuarter: number;
  byAgeRange: DashboardBucket[];
  byGender: DashboardBucket[];
  byEmploymentType: DashboardBucket[];
  byGrade: DashboardBucket[];
  byBranch: DashboardBucket[];
  byDesignation: DashboardBucket[];
  byDepartment: DashboardBucket[];
}

export interface AppraisalReviewer {
  id: string;
  appraisalId: string;
  reviewerId: string;
  relationType: AppraisalRelationType;
  status: AppraisalReviewStatus;
  rating: number | null;
  comments: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface Appraisal {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  status: AppraisalStatus;
  overallRating: string | null;
  createdAt: string;
  updatedAt: string;
  reviewers?: AppraisalReviewer[];
}

export interface AppraisalCycle {
  id: string;
  organizationId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AppraisalCycleStatus;
  createdAt: string;
  updatedAt: string;
  appraisals?: Appraisal[];
}

export const APPRAISAL_CYCLE_TRANSITIONS: Record<AppraisalCycleStatus, AppraisalCycleStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
};

// TERMINATED is the only real constraint the backend enforces (terminal —
// no further status changes once set); ACTIVE/ON_LEAVE are freely
// interchangeable otherwise.
export const EMPLOYMENT_STATUS_TRANSITIONS: Record<EmploymentStatus, EmploymentStatus[]> = {
  ACTIVE: ['ON_LEAVE', 'TERMINATED'],
  ON_LEAVE: ['ACTIVE', 'TERMINATED'],
  TERMINATED: [],
};

export const EMPLOYMENT_STATUS_COLORS: Record<EmploymentStatus, string> = {
  ACTIVE: 'green',
  ON_LEAVE: 'yellow',
  TERMINATED: 'gray',
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERN: 'Intern',
  CONTRACT: 'Contract',
  COMMUNITY: 'Community',
};

export const EMPLOYEE_GRADE_LABELS: Record<EmployeeGrade, string> = {
  ENTRY: 'Entry',
  JUNIOR: 'Junior',
  SENIOR: 'Senior',
  MANAGEMENT: 'Management',
};

export const APPRAISAL_CYCLE_STATUS_COLORS: Record<AppraisalCycleStatus, string> = {
  DRAFT: 'blue',
  ACTIVE: 'green',
  CLOSED: 'gray',
};

export const APPRAISAL_STATUS_COLORS: Record<AppraisalStatus, string> = {
  PENDING: 'blue',
  IN_PROGRESS: 'yellow',
  COMPLETED: 'green',
};

// --- Shift & Attendance ---

export interface Shift {
  id: string;
  organizationId: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  breakMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: AttendanceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Employee;
}

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'green',
  LATE: 'yellow',
  HALF_DAY: 'orange',
  ABSENT: 'red',
  ON_LEAVE: 'blue',
  HOLIDAY: 'grape',
};
