import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CanFrame, DbcMessage, BusStats, FaultAlert, AlertChangeLog, AlertSeverity, AlertChangeType } from '../types';
import { parseDbc, decodeCanFrame, DEFAULT_DBC_CONTENT } from '../utils/dbc-parser';

let frameIdCounter = 0;

export const useCanBusStore = defineStore('canbus', () => {
  const frames = ref<CanFrame[]>([]);
  const signals = ref<Map<string, { name: string; data: { time: number; value: number }[] }>>(new Map());
  const dbcMessages = ref<Map<number, DbcMessage>>(new Map());
  const filterId = ref('');
  const filterText = ref('');
  const isCapturing = ref(false);
  const pollInterval = ref<number | null>(null);

  const busStats = ref<BusStats>({
    totalFrames: 0,
    rxCount: 0,
    txCount: 0,
    errorCount: 0,
    busLoad: 0,
    lastUpdate: Date.now()
  });

  const alerts = ref<FaultAlert[]>([]);
  const alertChangeLogs = ref<AlertChangeLog[]>([]);
  let alertIdCounter = 0;
  let logIdCounter = 0;

  const signalThresholds = ref<Record<string, { warning: number; critical: number; direction: 'above' | 'below' }>>({
    EngineRPM: { warning: 5500, critical: 6200, direction: 'above' },
    CoolantTemp: { warning: 95, critical: 105, direction: 'above' },
    EngineLoad: { warning: 85, critical: 95, direction: 'above' },
    ThrottlePosition: { warning: 90, critical: 98, direction: 'above' },
    VehicleSpeed: { warning: 120, critical: 150, direction: 'above' }
  });

  const faultCodeMap: Record<string, { code: string; description: string }> = {
    EngineRPM: { code: 'P0217', description: '发动机转速过高' },
    CoolantTemp: { code: 'P0118', description: '冷却液温度过高' },
    EngineLoad: { code: 'P0123', description: '发动机负载过高' },
    ThrottlePosition: { code: 'P0222', description: '节气门位置异常' },
    VehicleSpeed: { code: 'P0502', description: '车速信号异常' }
  };

  const filteredFrames = computed(() => {
    let result = frames.value;

    if (filterId.value.trim()) {
      const idFilter = filterId.value.trim().toLowerCase().replace(/^0x/, '');
      result = result.filter(f =>
        f.arbitrationId.toString(16).toLowerCase().includes(idFilter)
      );
    }

    if (filterText.value.trim()) {
      const textFilter = filterText.value.trim().toLowerCase();
      result = result.filter(f => {
        if (f.arbitrationId.toString(16).toLowerCase().includes(textFilter)) return true;
        if (f.data.toLowerCase().includes(textFilter)) return true;
        for (const key of Object.keys(f.decoded)) {
          if (key.toLowerCase().includes(textFilter)) return true;
        }
        return false;
      });
    }

    return result;
  });

  const busLoadPercent = computed(() => {
    return busStats.value.busLoad.toFixed(1);
  });

  const activeAlerts = computed(() =>
    alerts.value.filter(a => a.status !== 'resolved')
  );

  const criticalAlerts = computed(() =>
    alerts.value.filter(a => a.severity === 'critical' && a.status !== 'resolved')
  );

  const warningAlerts = computed(() =>
    alerts.value.filter(a => a.severity === 'warning' && a.status !== 'resolved')
  );

  const infoAlerts = computed(() =>
    alerts.value.filter(a => a.severity === 'info' && a.status !== 'resolved')
  );

  const alertStats = computed(() => ({
    total: alerts.value.length,
    active: activeAlerts.value.length,
    critical: criticalAlerts.value.length,
    warning: warningAlerts.value.length,
    info: infoAlerts.value.length,
    resolved: alerts.value.filter(a => a.status === 'resolved').length
  }));

  function addFrame(frame: CanFrame) {
    frames.value.push(frame);
    if (frames.value.length > 500) {
      frames.value = frames.value.slice(-500);
    }

    busStats.value.totalFrames++;
    if (frame.direction === 'RX') busStats.value.rxCount++;
    else busStats.value.txCount++;
    busStats.value.lastUpdate = Date.now();

    // Update signal history
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (msgDef) {
      const decoded = decodeCanFrame(frame, msgDef);
      frame.decoded = decoded;
      for (const [name, value] of Object.entries(decoded)) {
        if (!signals.value.has(name)) {
          signals.value.set(name, { name, data: [] });
        }
        const sig = signals.value.get(name)!;
        sig.data.push({ time: frame.timestamp, value });
        if (sig.data.length > 100) {
          sig.data = sig.data.slice(-100);
        }
      }
    }

    // Simulate bus load (random 15-45%)
    busStats.value.busLoad = 15 + Math.random() * 30;

    // Detect anomalies from decoded signals
    if (msgDef && Object.keys(frame.decoded).length > 0) {
      detectSignalAnomalies(frame);
    }
  }

  function detectSignalAnomalies(frame: CanFrame) {
    for (const [signalName, signalValue] of Object.entries(frame.decoded)) {
      const threshold = signalThresholds.value[signalName];
      if (!threshold) continue;

      let severity: AlertSeverity | null = null;
      let thresholdValue: number | null = null;

      if (threshold.direction === 'above') {
        if (signalValue >= threshold.critical) {
          severity = 'critical';
          thresholdValue = threshold.critical;
        } else if (signalValue >= threshold.warning) {
          severity = 'warning';
          thresholdValue = threshold.warning;
        }
      } else {
        if (signalValue <= threshold.critical) {
          severity = 'critical';
          thresholdValue = threshold.critical;
        } else if (signalValue <= threshold.warning) {
          severity = 'warning';
          thresholdValue = threshold.warning;
        }
      }

      if (severity && thresholdValue !== null) {
        updateOrCreateAlert(signalName, signalValue, severity, thresholdValue, frame);
      } else {
        recordRecovery(signalName, signalValue, frame);
      }
    }
  }

  function updateOrCreateAlert(
    signalName: string,
    signalValue: number,
    severity: AlertSeverity,
    threshold: number,
    frame: CanFrame
  ) {
    const existing = alerts.value.find(
      a => a.signalName === signalName && a.status !== 'resolved'
    );

    const faultInfo = faultCodeMap[signalName] || {
      code: `U0${signalName.substring(0, 4).toUpperCase()}`,
      description: `${signalName} 信号异常`
    };

    if (existing) {
      const wasRecovered = existing.recoveredAt !== undefined;
      const recoveredValue = existing.signalValue;

      existing.lastSeen = frame.timestamp;
      existing.count++;
      existing.frameIds.push(frame.id);
      if (existing.frameIds.length > 20) {
        existing.frameIds = existing.frameIds.slice(-20);
      }
      existing.signalValue = signalValue;
      existing.recoveredAt = undefined;

      if (existing.severity !== severity) {
        addChangeLog(existing.id, 'severity', 'severity', existing.severity, severity, 'system');
        existing.severity = severity;
      }

      if (wasRecovered) {
        addChangeLog(
          existing.id,
          'trigger',
          'signalValue',
          recoveredValue !== undefined ? recoveredValue.toFixed(1) : '-',
          signalValue.toFixed(1),
          'system'
        );
      }
    } else {
      const newAlert: FaultAlert = {
        id: `alert-${++alertIdCounter}`,
        faultCode: faultInfo.code,
        description: faultInfo.description,
        severity,
        status: 'active',
        firstSeen: frame.timestamp,
        lastSeen: frame.timestamp,
        count: 1,
        frameIds: [frame.id],
        signalName,
        signalValue,
        threshold
      };
      alerts.value.unshift(newAlert);
      if (alerts.value.length > 200) {
        alerts.value = alerts.value.slice(0, 200);
      }
      addChangeLog(newAlert.id, 'trigger', 'status', '-', 'active', 'system');
    }
  }

  function recordRecovery(signalName: string, signalValue: number, frame: CanFrame) {
    const activeAlert = alerts.value.find(
      a => a.signalName === signalName && a.status !== 'resolved'
    );

    if (!activeAlert) return;
    if (activeAlert.recoveredAt !== undefined) return;

    const threshold = signalThresholds.value[signalName];
    if (!threshold) return;

    let isNormal = false;
    if (threshold.direction === 'above') {
      isNormal = signalValue < threshold.warning * 0.9;
    } else {
      isNormal = signalValue > threshold.warning * 1.1;
    }

    if (isNormal) {
      const oldValue = activeAlert.signalValue;
      activeAlert.recoveredAt = frame.timestamp;
      activeAlert.signalValue = signalValue;
      addChangeLog(
        activeAlert.id,
        'recovery',
        'signalValue',
        oldValue !== undefined ? oldValue.toFixed(1) : '-',
        signalValue.toFixed(1),
        'system'
      );
    }
  }

  function acknowledgeAlert(alertId: string, operator = 'user') {
    const alert = alerts.value.find(a => a.id === alertId);
    if (!alert || alert.status !== 'active') return;

    const oldStatus = alert.status;
    alert.status = 'acknowledged';
    alert.acknowledgedAt = Date.now();
    addChangeLog(alertId, 'ack', 'status', oldStatus, 'acknowledged', operator);
  }

  function resolveAlert(alertId: string, note?: string, operator = 'user') {
    const alert = alerts.value.find(a => a.id === alertId);
    if (!alert || alert.status === 'resolved') return;

    const oldStatus = alert.status;
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolvedBy = operator;
    if (note) {
      alert.resolutionNote = note;
    }
    addChangeLog(alertId, 'resolve', 'status', oldStatus, 'resolved', operator);
    if (note) {
      addChangeLog(alertId, 'resolve', 'resolutionNote', '-', note, operator);
    }
  }

  function addChangeLog(
    alertId: string,
    changeType: AlertChangeType,
    field: string,
    oldValue: string,
    newValue: string,
    operator: string
  ) {
    const log: AlertChangeLog = {
      id: `log-${++logIdCounter}`,
      alertId,
      timestamp: Date.now(),
      changeType,
      field,
      oldValue,
      newValue,
      operator
    };
    alertChangeLogs.value.unshift(log);
    if (alertChangeLogs.value.length > 500) {
      alertChangeLogs.value = alertChangeLogs.value.slice(0, 500);
    }
  }

  function getAlertChangeLogs(alertId: string): AlertChangeLog[] {
    return alertChangeLogs.value.filter(log => log.alertId === alertId);
  }

  function clearAlerts() {
    alerts.value = [];
    alertChangeLogs.value = [];
    alertIdCounter = 0;
    logIdCounter = 0;
  }

  function clearFrames() {
    frames.value = [];
    signals.value = new Map();
    busStats.value = {
      totalFrames: 0,
      rxCount: 0,
      txCount: 0,
      errorCount: 0,
      busLoad: 0,
      lastUpdate: Date.now()
    };
    frameIdCounter = 0;
    clearAlerts();
  }

  function loadMockDbc() {
    parseAndLoadDbc(DEFAULT_DBC_CONTENT);
  }

  function parseAndLoadDbc(text: string) {
    dbcMessages.value = parseDbc(text);
  }

  function generateMockFrame(): CanFrame {
    const messageIds = Array.from(dbcMessages.value.keys());
    const arbId = messageIds.length > 0
      ? messageIds[Math.floor(Math.random() * messageIds.length)]
      : 0x7DF;

    const msgDef = dbcMessages.value.get(arbId);

    let rpm: number;
    let speed: number;
    let temp: number;
    let throttle: number;
    let load: number;

    const anomalyRoll = Math.random();
    if (anomalyRoll < 0.08) {
      rpm = Math.floor(5600 + Math.random() * 800);
      temp = Math.floor(96 + Math.random() * 15);
      load = Math.floor(86 + Math.random() * 14);
      speed = Math.floor(100 + Math.random() * 40);
      throttle = Math.floor(85 + Math.random() * 15);
    } else if (anomalyRoll < 0.15) {
      rpm = Math.floor(5000 + Math.random() * 600);
      temp = Math.floor(90 + Math.random() * 8);
      load = Math.floor(80 + Math.random() * 8);
      speed = Math.floor(100 + Math.random() * 25);
      throttle = Math.floor(75 + Math.random() * 15);
    } else {
      rpm = Math.floor(800 + Math.random() * 4200);
      speed = Math.floor(Math.random() * 100);
      temp = Math.floor(70 + Math.random() * 25);
      throttle = Math.floor(Math.random() * 80);
      load = Math.floor(Math.random() * 75);
    }

    // Encode values into bytes (simplified encoding for display)
    const rpmRaw = Math.round(rpm / 0.25);
    const rpmLow = rpmRaw & 0xFF;
    const rpmHigh = (rpmRaw >> 8) & 0xFF;
    const speedByte = speed & 0xFF;
    const tempByte = (temp + 40) & 0xFF;
    const throttleByte = Math.round(throttle / 0.392) & 0xFF;
    const loadByte = Math.round(load / 0.392) & 0xFF;

    const dataBytes = [rpmLow, rpmHigh, speedByte, tempByte, throttleByte, loadByte, 0x00, 0x00];
    const dataHex = dataBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    const frame: CanFrame = {
      id: `frame-${++frameIdCounter}`,
      timestamp: Date.now(),
      arbitrationId: arbId,
      dlc: 8,
      data: dataHex,
      decoded: {},
      direction: Math.random() > 0.3 ? 'RX' : 'TX'
    };

    if (msgDef) {
      frame.decoded = {
        EngineRPM: rpm,
        VehicleSpeed: speed,
        CoolantTemp: temp,
        ThrottlePosition: throttle,
        EngineLoad: load
      };
    }

    return frame;
  }

  function startCapture() {
    if (isCapturing.value) return;
    isCapturing.value = true;

    // Load mock DBC if not loaded
    if (dbcMessages.value.size === 0) {
      loadMockDbc();
    }

    pollInterval.value = window.setInterval(() => {
      const frame = generateMockFrame();
      addFrame(frame);
    }, 200);
  }

  function stopCapture() {
    isCapturing.value = false;
    if (pollInterval.value !== null) {
      clearInterval(pollInterval.value);
      pollInterval.value = null;
    }
  }

  function decodeFrame(frame: CanFrame): Record<string, number> {
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (!msgDef) return {};
    return decodeCanFrame(frame, msgDef);
  }

  function exportFrames(): string {
    const header = 'Timestamp,Direction,CAN_ID,DLC,Data,Decoded\n';
    const rows = frames.value.map(f => {
      const decodedStr = Object.entries(f.decoded)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return `${f.timestamp},${f.direction},0x${f.arbitrationId.toString(16).toUpperCase()},${f.dlc},"${f.data}","${decodedStr}"`;
    }).join('\n');
    return header + rows;
  }

  return {
    frames,
    signals,
    dbcMessages,
    filterId,
    filterText,
    busStats,
    isCapturing,
    filteredFrames,
    busLoadPercent,
    alerts,
    alertChangeLogs,
    activeAlerts,
    criticalAlerts,
    warningAlerts,
    infoAlerts,
    alertStats,
    signalThresholds,
    addFrame,
    clearFrames,
    loadMockDbc,
    parseAndLoadDbc,
    startCapture,
    stopCapture,
    decodeFrame,
    exportFrames,
    acknowledgeAlert,
    resolveAlert,
    getAlertChangeLogs,
    clearAlerts
  };
});
