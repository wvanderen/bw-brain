#include "CapabilityProbeProcessor.h"

#include <clap/clap.h>
#include <clap/ext/audio-ports.h>
#include <clap/ext/note-ports.h>
#include <clap/ext/state.h>
#include <clap/ext/track-info.h>
#include <clap/factory/plugin-factory.h>

#include <algorithm>
#include <cstring>
#include <new>
#include <vector>

namespace {
using bwbrain::capability::CapabilityProbeProcessor;
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
  CapabilityProbeProcessor processor;
};

ProbePlugin* self(const clap_plugin_t* plugin) {
  return static_cast<ProbePlugin*>(plugin->plugin_data);
}

bool pluginInit(const clap_plugin_t* plugin) {
  auto* instance = self(plugin);
  if (instance->host && instance->host->get_extension) {
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
  const auto state = self(plugin)->processor.saveState();
  return stream && stream->write(stream, state.data(), state.size()) ==
                       static_cast<int64_t>(state.size());
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
  return self(plugin)->processor.loadState(state);
}
constexpr clap_plugin_state_t kState{stateSave, stateLoad};

const void* pluginExtension(const clap_plugin_t*, const char* id) {
  if (!std::strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &kAudioPorts;
  if (!std::strcmp(id, CLAP_EXT_NOTE_PORTS)) return &kNotePorts;
  if (!std::strcmp(id, CLAP_EXT_STATE)) return &kState;
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
