<script lang="ts" setup>
import { ref, watch, computed } from 'vue';

export interface SwitchOption {
  name: string;
  isAvailable?: boolean;
  isUserConfigured?: boolean;
}

const props = defineProps<{
  options: (string | SwitchOption)[];
  label: string;
  modelValue: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const input = ref('');
const showDropdown = ref(false);
const selectedValue = computed(() => props.modelValue);
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.modelValue,
  (val) => {
    input.value = val;
  },
  { immediate: true }
);

// 标准化选项格式
const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'string') {
      return { name: opt, isAvailable: true, isUserConfigured: false };
    }
    return { ...opt, isUserConfigured: opt.isUserConfigured ?? false };
  });
});

function selectOption(val: string) {
  emit('update:modelValue', val);
  showDropdown.value = false;
}

function clearSelection() {
  emit('update:modelValue', '');
  input.value = '';
  inputRef.value?.focus();
  showDropdown.value = true;
}

function filterOptions() {
  const filter = input.value.toLowerCase();
  return normalizedOptions.value.filter(opt => opt.name.toLowerCase().includes(filter));
}

function onInput(e: Event) {
  input.value = (e.target as HTMLInputElement).value;
  showDropdown.value = true;
}

function onFocus() {
  showDropdown.value = true;
}

function onBlur() {
  setTimeout(() => (showDropdown.value = false), 150);
}
</script>

<template>
  <div class="switch-select">
    <label class="switch-label">{{ label }}</label>
    <div class="input-wrapper">
      <input
        ref="inputRef"
        :placeholder="`选择或输入${label}`"
        v-model="input"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
        class="switch-input"
        :class="{ 'has-value': selectedValue }"
      />
      <button
        v-if="selectedValue"
        class="clear-selection-btn"
        @mousedown.prevent="clearSelection"
        title="清空选择"
      >
        <span class="clear-icon">×</span>
      </button>
      <div v-if="showDropdown" class="switch-dropdown">
        <!-- 用户配置的集群 -->
        <template v-for="opt in filterOptions().filter(o => o.isUserConfigured)" :key="opt.name">
          <div
            class="option-item"
            :class="{ 
              selected: selectedValue === opt.name,
              available: opt.isAvailable,
              unavailable: opt.isAvailable === false,
              'user-configured': true
            }"
            @mousedown.prevent="selectOption(opt.name)"
          >
            <span class="option-icon">{{ opt.isAvailable === false ? '⚠️' : '⭐' }}</span>
            <span>{{ opt.name }}</span>
            <span v-if="opt.isAvailable === false" class="option-status">不可用</span>
          </div>
        </template>
        
        <!-- 分隔符 -->
        <div 
          v-if="filterOptions().some(o => o.isUserConfigured) && filterOptions().some(o => !o.isUserConfigured)"
          class="option-group-separator"
        >
          <span class="separator-text">发现</span>
        </div>
        
        <!-- API发现的集群 -->
        <template v-for="opt in filterOptions().filter(o => !o.isUserConfigured)" :key="opt.name">
          <div
            class="option-item"
            :class="{ 
              selected: selectedValue === opt.name,
              available: opt.isAvailable,
              unavailable: opt.isAvailable === false,
              'api-discovered': true
            }"
            @mousedown.prevent="selectOption(opt.name)"
          >
            <span class="option-icon">{{ opt.isAvailable === false ? '⚠️' : '🔧' }}</span>
            <span>{{ opt.name }}</span>
            <span v-if="opt.isAvailable === false" class="option-status">不可用</span>
          </div>
        </template>
        
        <div v-if="input && !filterOptions().some(opt => opt.name.toLowerCase() === input.toLowerCase())" class="option-separator"></div>
        <div
          v-if="input && !filterOptions().some(opt => opt.name.toLowerCase() === input.toLowerCase())"
          class="option-item temporary"
          @mousedown.prevent="selectOption(input)"
        >
          <span class="option-icon">+</span>
          <span>使用: {{ input }}</span>
        </div>
        
        <div v-if="!filterOptions().length && !input" class="option-item-empty">
          <span>没有可用的选项</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.switch-select {
  position: relative;
}

.switch-label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
  font-weight: 500;
}

.input-wrapper {
  position: relative;
}

.switch-input {
  width: 100%;
  height: 44px;
  padding: 0 40px 0 16px;
  font-size: 14px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  background-color: #fff;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.switch-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.switch-input.has-value {
  border-color: #28a745;
  background-color: #f8fff9;
}

.clear-selection-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.clear-selection-btn:hover {
  background: #f1f3f5;
  transform: translateY(-50%);
}

.clear-icon {
  color: #868e96;
  font-size: 20px;
  line-height: 1;
  font-weight: 400;
  transition: color 0.2s ease;
}

.clear-selection-btn:hover .clear-icon {
  color: #495057;
}

.switch-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background-color: white;
  border: 2px solid #667eea;
  border-radius: 8px;
  margin-top: 4px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.15);
  z-index: 1000;
}

.option-item {
  padding: 12px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.option-item:hover {
  background-color: #f4f6ff;
}

.option-item.selected {
  background-color: #edf5ff;
  color: #667eea;
  font-weight: 500;
}

.option-item.current-option {
  border-bottom: 1px solid #f0f0f0;
}

.option-item.temporary {
  border-top: 1px dashed #ddd;
  color: #666;
  font-style: italic;
}

.option-item.available {
  color: #333;
}

.option-item.unavailable {
  color: #888;
  opacity: 0.7;
}

.option-item.unavailable:hover {
  background-color: #ffebee !important;
  opacity: 1;
}

.option-item.unavailable .option-icon {
  color: #e57373 !important;
}

/* 用户配置的集群样式 */
.option-item.user-configured {
  background: linear-gradient(90deg, #f0f7ff 0%, #fff 100%);
  border-left: 3px solid #667eea;
  font-weight: 500;
}

.option-item.user-configured:hover {
  background: linear-gradient(90deg, #eaf0ff 0%, #fafbff 100%) !important;
}

.option-item.user-configured .option-icon {
  color: #667eea !important;
}

/* API发现的集群样式 */
.option-item.api-discovered {
  color: #666;
  font-weight: normal;
}

.option-item.api-discovered:hover {
  background-color: #f1f3f5 !important;
}

.option-item.api-discovered .option-icon {
  color: #6c757d !important;
}

.option-status {
  margin-left: auto;
  font-size: 11px;
  color: #e57373;
  background: #ffebee;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.option-icon {
  font-size: 12px;
  color: #667eea;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.option-separator {
  height: 1px;
  background-color: #eee;
  margin: 4px 0;
}

.option-group-separator {
  padding: 8px 16px 4px;
  background-color: #f8f9fa;
  border-top: 1px solid #e9ecef;
  border-bottom: 1px solid #e9ecef;
}

.separator-text {
  font-size: 11px;
  color: #6c757d;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.switch-dropdown::-webkit-scrollbar {
  width: 6px;
}

.switch-dropdown::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 3px;
}

.switch-dropdown::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.switch-dropdown::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}
</style>
