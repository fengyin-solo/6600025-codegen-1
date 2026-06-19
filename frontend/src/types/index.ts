export interface CanFrame {
  id: string;
  timestamp: number;
  arbitrationId: number;
  dlc: number;
  data: string;
  decoded: Record<string, number>;
  direction: 'RX' | 'TX';
}

export interface DbcSignal {
  name: string;
  startBit: number;
  bitLength: number;
  factor: number;
  offset: number;
  unit: string;
  minValue: number;
  maxValue: number;
  messageId: number;
}

export interface DbcMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignal[];
}

export interface BusStats {
  totalFrames: number;
  rxCount: number;
  txCount: number;
  errorCount: number;
  busLoad: number;
  lastUpdate: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface FaultAlert {
  id: string;
  faultCode: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  firstSeen: number;
  lastSeen: number;
  count: number;
  frameIds: string[];
  signalName?: string;
  signalValue?: number;
  threshold?: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface AlertChangeLog {
  id: string;
  alertId: string;
  timestamp: number;
  field: string;
  oldValue: string;
  newValue: string;
  operator: string;
}
