<script setup lang="ts">
import { ref } from 'vue';
import { useCanBusStore } from './store/canbus';
import FrameTable from './components/FrameTable.vue';
import SignalChart from './components/SignalChart.vue';
import AlertCenter from './components/AlertCenter.vue';

const store = useCanBusStore();
const rightPanelTab = ref<'chart' | 'alerts'>('alerts');

function handleLoadDbc() {
  store.loadMockDbc();
  alert(`已加载 DBC 定义: ${store.dbcMessages.size} 条消息`);
}

function handleExport() {
  const csv = store.exportFrames();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `can_frames_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <h1 class="text-lg font-bold text-gray-100">CAN 总线数据帧解析与诊断仪</h1>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="handleLoadDbc"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          加载DBC
        </button>
        <button
          @click="store.isCapturing ? store.stopCapture() : store.startCapture()"
          class="px-3 py-1.5 text-sm rounded transition-colors font-medium"
          :class="store.isCapturing
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'"
        >
          {{ store.isCapturing ? '停止捕获' : '开始捕获' }}
        </button>
        <button
          @click="store.clearFrames()"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          清除
        </button>
        <button
          @click="handleExport"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          导出CSV
        </button>
        <div class="w-px h-6 bg-gray-600 mx-1"></div>
        <div class="flex items-center gap-1 bg-gray-700 rounded p-0.5">
          <button
            @click="rightPanelTab = 'chart'"
            class="px-2.5 py-1 text-xs rounded transition-colors"
            :class="rightPanelTab === 'chart'
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:text-gray-200'"
          >
            信号图
          </button>
          <button
            @click="rightPanelTab = 'alerts'"
            class="px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1"
            :class="rightPanelTab === 'alerts'
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:text-gray-200'"
          >
            告警中心
            <span
              v-if="store.alertStats.critical > 0"
              class="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold"
            >
              {{ store.alertStats.critical }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Area -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Frame Table (60%) -->
      <div class="w-3/5 border-r border-gray-700 flex flex-col overflow-hidden">
        <FrameTable />
      </div>

      <!-- Right Panel (40%) -->
      <div class="w-2/5 flex flex-col overflow-hidden">
        <SignalChart v-if="rightPanelTab === 'chart'" />
        <AlertCenter v-else />
      </div>
    </main>

    <!-- Status Bar -->
    <footer class="flex items-center justify-between px-6 py-1.5 bg-gray-800 border-t border-gray-700 text-xs shrink-0">
      <div class="flex items-center gap-4 text-gray-500">
        <span>
          <span :class="store.isCapturing ? 'text-green-400' : 'text-gray-500'">
            ● {{ store.isCapturing ? '捕获中' : '已停止' }}
          </span>
        </span>
        <span>DBC消息: {{ store.dbcMessages.size }}</span>
      </div>
      <div class="flex items-center gap-4 text-gray-500">
        <span>帧数: {{ store.busStats.totalFrames }}</span>
        <span>RX: {{ store.busStats.rxCount }}</span>
        <span>TX: {{ store.busStats.txCount }}</span>
        <span>负载: {{ store.busLoadPercent }}%</span>
        <span class="text-gray-600">|</span>
        <span>
          告警:
          <span class="text-red-400 font-bold">{{ store.alertStats.critical }}</span>
          <span class="text-gray-600">/</span>
          <span class="text-yellow-400 font-bold">{{ store.alertStats.warning }}</span>
          <span class="text-gray-600">/</span>
          <span class="text-blue-400 font-bold">{{ store.alertStats.info }}</span>
        </span>
      </div>
    </footer>
  </div>
</template>
