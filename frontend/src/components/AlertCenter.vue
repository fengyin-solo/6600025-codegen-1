<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCanBusStore } from '../store/canbus';
import type { FaultAlert, AlertChangeLog, AlertSeverity, AlertStatus } from '../types';

const store = useCanBusStore();
const selectedAlertId = ref<string | null>(null);
const statusFilter = ref<AlertStatus | 'all'>('all');
const severityFilter = ref<AlertSeverity | 'all'>('all');
const resolveNote = ref('');
const showResolveDialog = ref(false);

const selectedAlert = computed(() => {
  if (!selectedAlertId.value) return null;
  return store.alerts.find(a => a.id === selectedAlertId.value) || null;
});

const selectedAlertLogs = computed((): AlertChangeLog[] => {
  if (!selectedAlertId.value) return [];
  return store.getAlertChangeLogs(selectedAlertId.value);
});

const filteredAlerts = computed(() => {
  let result = store.alerts;

  if (statusFilter.value !== 'all') {
    result = result.filter(a => a.status === statusFilter.value);
  }

  if (severityFilter.value !== 'all') {
    result = result.filter(a => a.severity === severityFilter.value);
  }

  return result;
});

function selectAlert(id: string) {
  selectedAlertId.value = selectedAlertId.value === id ? null : id;
  resolveNote.value = '';
  showResolveDialog.value = false;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function getSeverityLabel(severity: AlertSeverity): string {
  const labels: Record<AlertSeverity, string> = {
    critical: '严重',
    warning: '警告',
    info: '提示'
  };
  return labels[severity];
}

function getSeverityClass(severity: AlertSeverity): string {
  const classes: Record<AlertSeverity, string> = {
    critical: 'bg-red-900/50 text-red-400 border-red-700',
    warning: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
    info: 'bg-blue-900/50 text-blue-400 border-blue-700'
  };
  return classes[severity];
}

function getSeverityBadgeClass(severity: AlertSeverity): string {
  const classes: Record<AlertSeverity, string> = {
    critical: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };
  return classes[severity];
}

function getStatusLabel(status: AlertStatus): string {
  const labels: Record<AlertStatus, string> = {
    active: '活动',
    acknowledged: '已确认',
    resolved: '已解决'
  };
  return labels[status];
}

function getStatusClass(status: AlertStatus): string {
  const classes: Record<AlertStatus, string> = {
    active: 'bg-green-900/50 text-green-400',
    acknowledged: 'bg-purple-900/50 text-purple-400',
    resolved: 'bg-gray-700/50 text-gray-400'
  };
  return classes[status];
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    status: '状态',
    severity: '严重级别',
    resolutionNote: '处理说明'
  };
  return labels[field] || field;
}

function handleAcknowledge(alertId: string) {
  store.acknowledgeAlert(alertId);
}

function openResolveDialog() {
  showResolveDialog.value = true;
}

function handleResolve() {
  if (selectedAlertId.value) {
    store.resolveAlert(selectedAlertId.value, resolveNote.value || undefined);
    showResolveDialog.value = false;
    resolveNote.value = '';
  }
}

function getSignalUnit(name: string): string {
  const units: Record<string, string> = {
    EngineRPM: 'rpm',
    VehicleSpeed: 'km/h',
    CoolantTemp: '°C',
    ThrottlePosition: '%',
    EngineLoad: '%'
  };
  return units[name] || '';
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Alert Stats Header -->
    <div class="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
        <span class="text-gray-400 text-sm">严重:</span>
        <span class="text-red-400 font-mono font-bold text-sm">{{ store.alertStats.critical }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
        <span class="text-gray-400 text-sm">警告:</span>
        <span class="text-yellow-400 font-mono font-bold text-sm">{{ store.alertStats.warning }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-blue-500"></span>
        <span class="text-gray-400 text-sm">提示:</span>
        <span class="text-blue-400 font-mono font-bold text-sm">{{ store.alertStats.info }}</span>
      </div>
      <div class="flex-1"></div>
      <div class="text-gray-500 text-xs">
        总数: {{ store.alertStats.total }} | 已解决: {{ store.alertStats.resolved }}
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
      <select
        v-model="severityFilter"
        class="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
      >
        <option value="all">全部级别</option>
        <option value="critical">严重</option>
        <option value="warning">警告</option>
        <option value="info">提示</option>
      </select>
      <select
        v-model="statusFilter"
        class="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
      >
        <option value="all">全部状态</option>
        <option value="active">活动</option>
        <option value="acknowledged">已确认</option>
        <option value="resolved">已解决</option>
      </select>
      <div class="flex-1"></div>
      <button
        @click="store.clearAlerts()"
        class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
      >
        清除全部
      </button>
    </div>

    <!-- Alert List -->
    <div class="flex-1 overflow-auto">
      <div v-if="filteredAlerts.length === 0" class="flex items-center justify-center h-full text-gray-500 text-sm">
        暂无告警信息
      </div>
      <div
        v-for="alert in filteredAlerts"
        :key="alert.id"
        @click="selectAlert(alert.id)"
        class="border-b border-gray-800 cursor-pointer transition-colors"
        :class="[
          selectedAlertId === alert.id
            ? 'bg-cyan-900/20 border-l-2 border-l-cyan-500'
            : 'hover:bg-gray-800/50 border-l-2 border-l-transparent'
        ]"
      >
        <div class="px-4 py-2.5">
          <div class="flex items-start justify-between mb-1">
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full shrink-0 mt-1"
                :class="getSeverityBadgeClass(alert.severity)"
              ></span>
              <span class="font-mono text-sm font-bold text-gray-200">{{ alert.faultCode }}</span>
              <span
                class="px-1.5 py-0.5 rounded text-xs font-medium"
                :class="getStatusClass(alert.status)"
              >
                {{ getStatusLabel(alert.status) }}
              </span>
            </div>
            <span class="text-xs text-gray-500">{{ formatTimestamp(alert.lastSeen) }}</span>
          </div>
          <div class="text-sm text-gray-400 ml-4">
            {{ alert.description }}
          </div>
          <div class="flex items-center gap-3 mt-1.5 ml-4 text-xs text-gray-500">
            <span v-if="alert.signalName">
              <span class="text-gray-600">{{ alert.signalName }}:</span>
              <span class="text-yellow-400 font-mono">
                {{ alert.signalValue?.toFixed(1) }} {{ getSignalUnit(alert.signalName) }}
              </span>
            </span>
            <span>
              <span class="text-gray-600">阈值:</span>
              <span class="text-gray-400 font-mono">{{ alert.threshold?.toFixed(1) }}</span>
            </span>
            <span>
              <span class="text-gray-600">次数:</span>
              <span class="text-gray-400 font-mono">{{ alert.count }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <div
      v-if="selectedAlert"
      class="border-t border-gray-700 max-h-72 overflow-auto"
      style="background-color: #1a2234;"
    >
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-200">
            告警详情 — {{ selectedAlert.faultCode }}
            <span
              class="ml-2 px-2 py-0.5 rounded text-xs font-medium border"
              :class="getSeverityClass(selectedAlert.severity)"
            >
              {{ getSeverityLabel(selectedAlert.severity) }}
            </span>
          </h3>
          <div class="flex items-center gap-2">
            <button
              v-if="selectedAlert.status === 'active'"
              @click.stop="handleAcknowledge(selectedAlert.id)"
              class="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              确认
            </button>
            <button
              v-if="selectedAlert.status !== 'resolved'"
              @click.stop="openResolveDialog"
              class="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              解决
            </button>
          </div>
        </div>

        <!-- Resolve Dialog -->
        <div
          v-if="showResolveDialog"
          class="mb-3 p-3 bg-gray-800 rounded-lg border border-gray-600"
        >
          <p class="text-xs text-gray-400 mb-2">输入处理说明（可选）:</p>
          <textarea
            v-model="resolveNote"
            rows="2"
            placeholder="请描述处理方式..."
            class="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
          ></textarea>
          <div class="flex justify-end gap-2 mt-2">
            <button
              @click.stop="showResolveDialog = false; resolveNote = ''"
              class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              取消
            </button>
            <button
              @click.stop="handleResolve"
              class="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              确认解决
            </button>
          </div>
        </div>

        <!-- Alert Info Grid -->
        <div class="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div class="bg-gray-800/50 rounded p-2">
            <span class="text-gray-500">首次出现:</span>
            <span class="ml-1 text-gray-300 font-mono">{{ formatDateTime(selectedAlert.firstSeen) }}</span>
          </div>
          <div class="bg-gray-800/50 rounded p-2">
            <span class="text-gray-500">最后出现:</span>
            <span class="ml-1 text-gray-300 font-mono">{{ formatDateTime(selectedAlert.lastSeen) }}</span>
          </div>
          <div class="bg-gray-800/50 rounded p-2">
            <span class="text-gray-500">触发次数:</span>
            <span class="ml-1 text-yellow-400 font-mono font-bold">{{ selectedAlert.count }}</span>
          </div>
          <div class="bg-gray-800/50 rounded p-2">
            <span class="text-gray-500">状态:</span>
            <span class="ml-1" :class="getStatusClass(selectedAlert.status)">
              {{ getStatusLabel(selectedAlert.status) }}
            </span>
          </div>
        </div>

        <!-- Resolution Note -->
        <div v-if="selectedAlert.resolutionNote" class="mb-4 p-2 bg-green-900/20 border border-green-700/50 rounded">
          <p class="text-xs text-gray-500 mb-1">处理说明:</p>
          <p class="text-sm text-green-400">{{ selectedAlert.resolutionNote }}</p>
          <p v-if="selectedAlert.resolvedBy" class="text-xs text-gray-500 mt-1">
            处理人: {{ selectedAlert.resolvedBy }} · {{ formatDateTime(selectedAlert.resolvedAt || 0) }}
          </p>
        </div>

        <!-- Change Log -->
        <div>
          <h4 class="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            变化记录
          </h4>
          <div class="space-y-1.5">
            <div
              v-for="log in selectedAlertLogs"
              :key="log.id"
              class="flex items-start gap-2 text-xs"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 shrink-0"></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-gray-400">
                  <span class="font-mono text-gray-500">{{ formatTimestamp(log.timestamp) }}</span>
                  <span class="text-gray-600">{{ log.operator }}</span>
                </div>
                <div class="text-gray-300 mt-0.5">
                  <span class="text-gray-500">{{ getFieldLabel(log.field) }}:</span>
                  <span v-if="log.oldValue !== '-'" class="text-red-400 line-through">{{ log.oldValue }}</span>
                  <span class="text-gray-600 mx-1">→</span>
                  <span class="text-green-400">{{ log.newValue }}</span>
                </div>
              </div>
            </div>
            <div v-if="selectedAlertLogs.length === 0" class="text-gray-600 text-xs">
              暂无变化记录
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
