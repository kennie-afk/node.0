export interface User {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'FIELD_AGENT';
}

export interface Field {
  id: number;
  name: string;
  cropType: string;
  plantingDate: string;
  currentStage: 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';
  status: 'ACTIVE' | 'AT_RISK' | 'COMPLETED';
  assignedAgent?: User;
  observations?: any[];
}

export interface DashboardData {
  totalFields: number;
  fields: Field[];
  statusBreakdown: {
    ACTIVE: number;
    'AT_RISK': number;
    COMPLETED: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}