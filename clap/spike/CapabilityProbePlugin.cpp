#include "CapabilityProbeProcessor.h"
#include "CapabilityProbeEditor.h"

#include <clap/clap.h>
#include <clap/ext/audio-ports.h>
#include <clap/ext/gui.h>
#include <clap/ext/note-ports.h>
#include <clap/ext/params.h>
#include <clap/ext/state.h>
#include <clap/ext/track-info.h>
#include <clap/factory/plugin-factory.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <vector>

namespace {
using bwbrain::capability::CapabilityProbeProcessor;
using bwbrain::capability::CapabilityProbeEditor;
using bwbrain::capability::TrackInfoInput;

constexpr char kPluginId[] = "com.bwbrain.capability-probe";
constexpr const char* kFeatures[] = {CLAP_PLUGIN_FEATURE_NOTE_EFFECT,
                                     CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, nullptr};
constexpr clap_plugin_descriptor_t kDescriptor{
    CLAP_VERSION, kPluginId, "bw-brain Capability Probe", "bw-brain",
    "https://github.com/bw-brain", "", "", "0.0.0", "Throwaway Phase 04.1 host probe",
    kFeatures};

struct ProbePlugin {
  clap_plugin_t plugin{};
  const clap_host_t* host{};
  const clap_host_params_t* hostParams{};
  CapabilityProbeProcessor processor;
  CapabilityProbeEditor editor;
  std::array<std::atomic<double>, 3> parameterValues{{0.0, 0.0, 0.5}};
};

int parameterIndex(clap_id id) { return id >= 100 && id <= 102 ? static_cast<int>(id - 100) : -1; }
void consumeParameters(ProbePlugin* instance, const clap_input_events_t* events) {
  if (!events) return;
  for (uint32_t i = 0; i < events->size(events); ++i) {
    const auto* header = events->get(events, i);
    if (!header || header->space_id != CLAP_CORE_EVENT_SPACE_ID ||
        header->type != CLAP_EVENT_PARAM_VALUE) continue;
    const auto* value = reinterpret_cast<const clap_event_param_value_t*>(header);
    const int index = parameterIndex(value->param_id);
    if (index > 0) instance->parameterValues[index].store(std::clamp(value->value, 0.0, 1.0));
  }
}

ProbePlugin* self(const clap_plugin_t* plugin) {
  return static_cast<ProbePlugin*>(plugin->plugin_data);
}

bool pluginInit(const clap_plugin_t* plugin) {
  auto* instance = self(plugin);
  if (instance->host && instance->host->get_extension) {
    instance->hostParams = static_cast<const clap_host_params_t*>(
        instance->host->get_extension(instance->host, CLAP_EXT_PARAMS));
    const auto* track = static_cast<const clap_host_track_info_t*>(
        instance->host->get_extension(instance->host, CLAP_EXT_TRACK_INFO));
    if (track && track->get) {
      clap_track_info_t info{};
      if (track->get(instance->host, &info)) {
        const TrackInfoInput input{info.name, static_cast<uint32_t>(info.audio_channel_count)};
        (void)instance->processor.observeTrackInfo(&input);
      }
    } else {
      (void)instance->processor.observeTrackInfo(nullptr);
    }
  }
  return true;
}

void pluginDestroy(const clap_plugin_t* plugin) { delete self(plugin); }
bool pluginActivate(const clap_plugin_t*, double, uint32_t, uint32_t) { return true; }
void pluginDeactivate(const clap_plugin_t*) {}
bool pluginStart(const clap_plugin_t*) { return true; }
void pluginStop(const clap_plugin_t*) {}
void pluginReset(const clap_plugin_t*) {}

clap_process_status pluginProcess(const clap_plugin_t* plugin, const clap_process_t* process) {
  auto& processor = self(plugin)->processor;
  consumeParameters(self(plugin), process->in_events);
  const auto portCount = std::min(process->audio_inputs_count, process->audio_outputs_count);
  for (uint32_t port = 0; port < portCount; ++port) {
    const auto channels = std::min(process->audio_inputs[port].channel_count,
                                   process->audio_outputs[port].channel_count);
    for (uint32_t channel = 0; channel < channels; ++channel) {
      if (process->audio_inputs[port].data32 && process->audio_outputs[port].data32)
        processor.passThrough(process->audio_inputs[port].data32[channel],
                              process->audio_outputs[port].data32[channel], process->frames_count);
      else if (process->audio_inputs[port].data64 && process->audio_outputs[port].data64)
        processor.passThrough(process->audio_inputs[port].data64[channel],
                              process->audio_outputs[port].data64[channel], process->frames_count);
    }
  }
  if (process->in_events && process->out_events) {
    const auto count = process->in_events->size(process->in_events);
    for (uint32_t i = 0; i < count; ++i) {
      const auto* event = process->in_events->get(process->in_events, i);
      const bool isNoteEvent = event && event->space_id == CLAP_CORE_EVENT_SPACE_ID &&
                               (event->type == CLAP_EVENT_NOTE_ON ||
                                event->type == CLAP_EVENT_NOTE_OFF ||
                                event->type == CLAP_EVENT_NOTE_CHOKE ||
                                event->type == CLAP_EVENT_NOTE_END ||
                                event->type == CLAP_EVENT_NOTE_EXPRESSION ||
                                event->type == CLAP_EVENT_MIDI || event->type == CLAP_EVENT_MIDI_SYSEX ||
                                event->type == CLAP_EVENT_MIDI2);
      if (isNoteEvent)
        process->out_events->try_push(process->out_events, event);
    }
  }
  return CLAP_PROCESS_CONTINUE;
}

uint32_t audioPortCount(const clap_plugin_t*, bool) { return 1; }
bool audioPortGet(const clap_plugin_t*, uint32_t index, bool input, clap_audio_port_info_t* info) {
  if (index != 0 || !info) return false;
  info->id = 0;
  std::strncpy(info->name, input ? "Main Input" : "Main Output", sizeof(info->name) - 1);
  info->flags = CLAP_AUDIO_PORT_IS_MAIN | CLAP_AUDIO_PORT_SUPPORTS_64BITS |
                CLAP_AUDIO_PORT_REQUIRES_COMMON_SAMPLE_SIZE;
  info->channel_count = 2;
  info->port_type = CLAP_PORT_STEREO;
  info->in_place_pair = 0;
  return true;
}
constexpr clap_plugin_audio_ports_t kAudioPorts{audioPortCount, audioPortGet};

uint32_t notePortCount(const clap_plugin_t*, bool) { return 1; }
bool notePortGet(const clap_plugin_t*, uint32_t index, bool, clap_note_port_info_t* info) {
  if (index != 0 || !info) return false;
  info->id = 0;
  info->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI;
  info->preferred_dialect = CLAP_NOTE_DIALECT_CLAP;
  std::strncpy(info->name, "Notes", sizeof(info->name) - 1);
  return true;
}
constexpr clap_plugin_note_ports_t kNotePorts{notePortCount, notePortGet};

bool stateSave(const clap_plugin_t* plugin, const clap_ostream_t* stream) {
  if (!stream) return false;
  std::array<std::byte, 6 + sizeof(double) * 3> state{};
  constexpr char magic[] = "BWCPS1";
  std::memcpy(state.data(), magic, 6);
  for (std::size_t i = 0; i < 3; ++i) {
    const double value = self(plugin)->parameterValues[i].load();
    std::memcpy(state.data() + 6 + i * sizeof(double), &value, sizeof(value));
  }
  std::size_t offset = 0;
  while (offset < state.size()) {
    const auto written = stream->write(stream, state.data() + offset, state.size() - offset);
    if (written <= 0) return false;
    offset += static_cast<std::size_t>(written);
  }
  return true;
}
bool stateLoad(const clap_plugin_t* plugin, const clap_istream_t* stream) {
  if (!stream) return false;
  std::vector<std::byte> state;
  std::byte buffer[128];
  while (state.size() < 128) {
    const auto read = stream->read(stream, buffer, sizeof(buffer));
    if (read < 0) return false;
    if (read == 0) break;
    state.insert(state.end(), buffer, buffer + read);
  }
  constexpr char magic[] = "BWCPS1";
  if (state.size() != 6 + sizeof(double) * 3 || std::memcmp(state.data(), magic, 6)) return false;
  for (std::size_t i = 0; i < 3; ++i) {
    double value{};
    std::memcpy(&value, state.data() + 6 + i * sizeof(double), sizeof(value));
    if (value < 0.0 || value > 1.0) return false;
    self(plugin)->parameterValues[i].store(value);
  }
  if (self(plugin)->hostParams && self(plugin)->hostParams->rescan)
    self(plugin)->hostParams->rescan(self(plugin)->host, CLAP_PARAM_RESCAN_VALUES);
  return true;
}
constexpr clap_plugin_state_t kState{stateSave, stateLoad};

uint32_t parameterCount(const clap_plugin_t*) { return 3; }
bool parameterInfo(const clap_plugin_t*, uint32_t index, clap_param_info_t* info) {
  const auto& candidates = CapabilityProbeProcessor::parameterCandidates();
  if (!info || index >= candidates.size()) return false;
  const auto& candidate = candidates[index];
  *info = {};
  info->id = candidate.id;
  info->flags = CLAP_PARAM_IS_STEPPED;
  if (candidate.readOnly) info->flags |= CLAP_PARAM_IS_READONLY;
  if (candidate.automatable) info->flags |= CLAP_PARAM_IS_AUTOMATABLE;
  std::strncpy(info->name, candidate.name.data(), sizeof(info->name) - 1);
  std::strncpy(info->module, "Capability Evidence", sizeof(info->module) - 1);
  info->min_value = 0.0;
  info->max_value = 1.0;
  info->default_value = index == 2 ? 0.5 : 0.0;
  return true;
}
bool parameterValue(const clap_plugin_t* plugin, clap_id id, double* output) {
  const int index = parameterIndex(id);
  if (index < 0 || !output) return false;
  *output = self(plugin)->parameterValues[index].load();
  return true;
}
bool parameterToText(const clap_plugin_t*, clap_id id, double value, char* output, uint32_t size) {
  if (parameterIndex(id) < 0 || !output || size == 0) return false;
  std::snprintf(output, size, "%.3f", value);
  return true;
}
bool parameterFromText(const clap_plugin_t*, clap_id id, const char* text, double* output) {
  if (parameterIndex(id) < 0 || !text || !output) return false;
  char* end{};
  const double value = std::strtod(text, &end);
  if (end == text || *end != '\0') return false;
  *output = value;
  return true;
}
void parameterFlush(const clap_plugin_t* plugin, const clap_input_events_t* input,
                    const clap_output_events_t*) {
  consumeParameters(self(plugin), input);
}
constexpr clap_plugin_params_t kParams{parameterCount, parameterInfo, parameterValue,
                                       parameterToText, parameterFromText, parameterFlush};

bool guiSupported(const clap_plugin_t*, const char* api, bool floating) {
  return api && !floating && !std::strcmp(api, CLAP_WINDOW_API_COCOA);
}
bool guiPreferred(const clap_plugin_t*, const char** api, bool* floating) {
  if (!api || !floating) return false;
  *api = CLAP_WINDOW_API_COCOA;
  *floating = false;
  return true;
}
bool guiCreate(const clap_plugin_t* plugin, const char* api, bool floating) {
  return guiSupported(plugin, api, floating) && self(plugin)->editor.create(api);
}
void guiDestroy(const clap_plugin_t* plugin) { self(plugin)->editor.destroy(); }
bool guiScale(const clap_plugin_t*, double) { return false; }
bool guiGetSize(const clap_plugin_t* plugin, uint32_t* width, uint32_t* height) {
  if (!width || !height) return false;
  *width = self(plugin)->editor.lastWidth();
  *height = self(plugin)->editor.lastHeight();
  return true;
}
bool guiCanResize(const clap_plugin_t*) { return true; }
bool guiResizeHints(const clap_plugin_t*, clap_gui_resize_hints_t* hints) {
  if (!hints) return false;
  *hints = {true, true, false, 0, 0};
  return true;
}
bool guiAdjustSize(const clap_plugin_t*, uint32_t* width, uint32_t* height) {
  return width && height && *width > 0 && *height > 0;
}
bool guiSetSize(const clap_plugin_t* plugin, uint32_t width, uint32_t height) {
  return self(plugin)->editor.resize(width, height);
}
bool guiSetParent(const clap_plugin_t*, const clap_window_t* window) {
  return window && window->api && !std::strcmp(window->api, CLAP_WINDOW_API_COCOA);
}
bool guiSetTransient(const clap_plugin_t*, const clap_window_t*) { return false; }
void guiSuggestTitle(const clap_plugin_t*, const char*) {}
bool guiShow(const clap_plugin_t* plugin) { return self(plugin)->editor.show(); }
bool guiHide(const clap_plugin_t* plugin) { return self(plugin)->editor.hide(); }
constexpr clap_plugin_gui_t kGui{guiSupported, guiPreferred, guiCreate, guiDestroy, guiScale,
                                 guiGetSize, guiCanResize, guiResizeHints, guiAdjustSize, guiSetSize,
                                 guiSetParent, guiSetTransient, guiSuggestTitle, guiShow, guiHide};

const void* pluginExtension(const clap_plugin_t*, const char* id) {
  if (!std::strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &kAudioPorts;
  if (!std::strcmp(id, CLAP_EXT_NOTE_PORTS)) return &kNotePorts;
  if (!std::strcmp(id, CLAP_EXT_STATE)) return &kState;
  if (!std::strcmp(id, CLAP_EXT_PARAMS)) return &kParams;
  if (!std::strcmp(id, CLAP_EXT_GUI)) return &kGui;
  return nullptr;
}
void pluginMainThread(const clap_plugin_t*) {}

uint32_t factoryCount(const clap_plugin_factory_t*) { return 1; }
const clap_plugin_descriptor_t* factoryDescriptor(const clap_plugin_factory_t*, uint32_t index) {
  return index == 0 ? &kDescriptor : nullptr;
}
const clap_plugin_t* factoryCreate(const clap_plugin_factory_t*, const clap_host_t* host,
                                   const char* pluginId) {
  if (!host || !pluginId || std::strcmp(pluginId, kPluginId)) return nullptr;
  auto* instance = new (std::nothrow) ProbePlugin{};
  if (!instance) return nullptr;
  instance->host = host;
  instance->plugin = {&kDescriptor, instance, pluginInit, pluginDestroy, pluginActivate,
                      pluginDeactivate, pluginStart, pluginStop, pluginReset, pluginProcess,
                      pluginExtension, pluginMainThread};
  return &instance->plugin;
}
constexpr clap_plugin_factory_t kFactory{factoryCount, factoryDescriptor, factoryCreate};

bool entryInit(const char*) { return true; }
void entryDeinit() {}
const void* entryFactory(const char* id) {
  return id && !std::strcmp(id, CLAP_PLUGIN_FACTORY_ID) ? &kFactory : nullptr;
}
}  // namespace

extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry = {
    CLAP_VERSION, entryInit, entryDeinit, entryFactory};
