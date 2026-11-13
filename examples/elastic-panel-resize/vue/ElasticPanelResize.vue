<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { createMotionRuntime } from "../../../web/src/components/elastic-panel-resize/motion-runtime";
import type { ElasticPanelResizeOptions } from "../../../web/src/components/elastic-panel-resize/ElasticPanelResizeEngine.js";

const props = defineProps<{ options?: ElasticPanelResizeOptions }>();
const host = ref<HTMLElement | null>(null);
const runtime = createMotionRuntime(props.options);
onMounted(() => { if (host.value) runtime.mount(host.value); });
watch(() => props.options, (value) => runtime.update({ height: undefined, reducedMotion: undefined, ...value }), { deep: true });
onBeforeUnmount(() => runtime.destroy());
</script>

<template><div ref="host" style="width:100%;min-width:0" /></template>
